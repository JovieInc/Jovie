#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import datetime as dt
import fcntl
import hashlib
import io
import os
import pathlib
import re
import signal
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import importlib.util
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / "scripts/symphony/WORKFLOW.md"
WORKFLOW = WORKFLOW_PATH.read_text(encoding="utf-8")
UNIT_PATH = ROOT / "scripts/symphony/systemd/symphony-elixir.service"
UNIT = UNIT_PATH.read_text(encoding="utf-8")
UPDATER = (ROOT / "scripts/symphony/update-symphony-burrito.sh").read_text(encoding="utf-8")
HELPER_PATH = ROOT / "scripts/symphony/symphony_official_runtime.py"
LIVE_TEAM_KEY = "JOV"
TOKEN_RE = re.compile(r"lin_(?:api_|oauth_)?[A-Za-z0-9]{12,}|api_key:\s*(?!\$LINEAR_API_KEY\b)\S+")


def _load_helper():
    spec = importlib.util.spec_from_file_location("symphony_official_runtime", HELPER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _fleet_gate_payload(status="healthy", intake=True, observed_at=None):
    observed = observed_at or (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    return {
        "schema": "jovie-fleet-gate/v1",
        "observedAt": observed,
        "state": "GREEN" if status == "healthy" else "AMBER",
        "signals": {
            "closureHealth": {
                "schema": "jovie-closure-health/v1",
                "status": status,
                "authority": "Summer",
                "newIssueIntakeAllowed": intake,
                "promotionContinues": True,
                "remediationContinues": True,
                "reasons": [] if intake else ["duplicate-issue-lanes-unresolved"],
            }
        },
        "closureAdmission": {
            "allowed": intake,
            "newIssueIntakeAllowed": intake,
            "newImplementationAllowed": intake,
            "fallbackPrGenerationAllowed": intake,
            "authority": "Summer",
            "status": status,
            "promotionContinues": True,
            "remediationContinues": True,
        },
    }


def _closure_run_args(tmp):
    """Green fleet-gate fixture plus hermetic stop-line paths for run tests."""
    closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
    closure_gate.write_text(json.dumps(_fleet_gate_payload()), encoding="utf-8")
    return [
        "--closure-gate-file",
        str(closure_gate),
        "--closure-hold-receipt",
        str(pathlib.Path(tmp) / "closure-hold.json"),
        "--dead-letter-dir",
        str(pathlib.Path(tmp) / "dead-letters"),
    ]


def _bounded_repair_fixture(tmp, helper, *, lifetime_seconds=600):
    root = pathlib.Path(tmp)
    manifest_path = root / "repair-admission.json"
    source = root / "source"
    source.mkdir()
    subprocess.run(["git", "init", "-q", str(source)], check=True)
    subprocess.run(["git", "-C", str(source), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(source), "config", "user.name", "Test"], check=True)
    (source / "README").write_text("bounded repair\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(source), "add", "README"], check=True)
    subprocess.run(["git", "-C", str(source), "commit", "-qm", "fixture"], check=True)
    commit = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    workspace_root = root / f"workspace-JOV-9999-{commit[:12]}"
    workspace_root.mkdir()
    issue_workspace = workspace_root / "JOV-9999"
    label = "symphony-recovery-jov-9999-test"
    workflow = root / "WORKFLOW.repair.md"
    workflow.write_text(
        WORKFLOW.replace(
            "  excluded_labels:\n",
            f"  required_labels:\n    - {label}\n  excluded_labels:\n",
        )
        .replace("max_concurrent_agents: 8", "max_concurrent_agents: 1")
        .replace("max_turns: 20", "max_turns: 1")
        .replace("root: ~/symphony-elixir-workspaces", f"root: {workspace_root}")
        .replace("thread_sandbox: workspace-write", "thread_sandbox: read-only")
        .replace("type: workspaceWrite", "type: readOnly")
        .replace("networkAccess: true", "networkAccess: false"),
        encoding="utf-8",
    )
    codex_cli = root / "codex"
    codex_cli.write_text(
        "#!/bin/sh\n"
        "set -eu\n"
        "test -z \"${GITHUB_TOKEN+x}\"\n"
        "test -z \"${GH_TOKEN+x}\"\n"
        "test -z \"${LINEAR_API_KEY+x}\"\n"
        "test -z \"${AWS_SECRET_ACCESS_KEY+x}\"\n"
        "test -z \"${UNRELATED_RECOVERY_SECRET+x}\"\n"
        "test \"$SYMPHONY_RECOVERY_ISSUE_IDENTIFIER\" = JOV-9999\n"
        "test \"$SYMPHONY_RECOVERY_ISSUE_ID\" = 12345678-1234-1234-1234-123456789abc\n"
        "echo bounded-repair-ran\n",
        encoding="utf-8",
    )
    codex_cli.chmod(0o700)
    router = root / "router"
    router.write_text(helper._bounded_repair_router_script(codex_cli), encoding="utf-8")
    router.chmod(0o700)
    workflow.write_text(
        workflow.read_text(encoding="utf-8").replace(
            "./scripts/symphony/symphony-codex-router app-server",
            f"{HELPER_PATH} recovery-agent --manifest {manifest_path} "
            "--issue-identifier JOV-9999 "
            "--issue-id 12345678-1234-1234-1234-123456789abc "
            f"--workspace {issue_workspace} -- {router} app-server",
        ),
        encoding="utf-8",
    )
    binary = root / "binary"
    binary.write_text(
        "#!/bin/sh\n"
        "set -eu\n"
        "test -z \"${GITHUB_TOKEN+x}\"\n"
        "test -z \"${GH_TOKEN+x}\"\n"
        "test -z \"${AWS_SECRET_ACCESS_KEY+x}\"\n"
        "test -z \"${UNRELATED_RECOVERY_SECRET+x}\"\n"
        f"mkdir -p {issue_workspace}\n"
        f"cd {issue_workspace}\n"
        f"exec {HELPER_PATH} recovery-agent --manifest {manifest_path} "
        "--issue-identifier JOV-9999 "
        "--issue-id 12345678-1234-1234-1234-123456789abc "
        f"--workspace {issue_workspace} -- {router} app-server\n",
        encoding="utf-8",
    )
    binary.chmod(0o700)
    account = root / "codex-account.env"
    account.write_text("CODEX_HOME=/tmp/codex-fourth\n", encoding="utf-8")
    account.chmod(0o600)
    gate = root / "fleet-gate.json"
    fleet = _fleet_gate_payload(status="red", intake=False)
    fleet.update(
        workAdmission={"newIssueLeaseAllowed": False},
        remediationAdmission={
            "allowed": True,
            "localAllowed": True,
            "activities": ["isolated-pr-repair", "focused-tests"],
            "pushAllowed": False,
            "maxConcurrent": 0,
        },
        concurrency={
            "gem": {
                "runtimeFloor": 1,
                "maxConcurrent": 0,
                "evidenceAccepted": False,
                "newMutationAllowed": False,
            }
        },
    )
    gate.write_text(json.dumps(fleet), encoding="utf-8")
    now = dt.datetime.now(dt.timezone.utc)
    command = [str(binary), "--repair-canary", str(workflow)]
    artifact_paths = {
        "runtime": HELPER_PATH,
        "workflow": workflow,
        "router": router,
        "binary": binary,
        "codexCli": codex_cli,
        "accountEnv": account,
    }
    manifest = {
        "schema": helper.BOUNDED_REPAIR_SCHEMA,
        "status": "authorized",
        "issuedAt": (now - dt.timedelta(seconds=1)).isoformat(),
        "expiresAt": (now + dt.timedelta(seconds=lifetime_seconds)).isoformat(),
        "issueIdentifier": "JOV-9999",
        "issueId": "12345678-1234-1234-1234-123456789abc",
        "requiredLabel": label,
        "admissionField": "remediationAdmission",
        "activity": "isolated-pr-repair",
        "maxConcurrent": 1,
        "newIssueIntakeAllowed": False,
        "pushAllowed": False,
        "model": helper.BOUNDED_REPAIR_MODEL,
        "modelRateLimitId": helper.BOUNDED_REPAIR_MODEL_LIMIT_ID,
        "modelFallbackAllowed": False,
        "externalExpiry": {
            "kind": helper.BOUNDED_REPAIR_EXPIRY_KIND,
            "unit": f"{label}.service",
            "runtimeMaxSeconds": helper.BOUNDED_REPAIR_MAX_SECONDS,
            "killMode": "control-group",
            "sendSIGKILL": True,
        },
        "fleetGatePath": str(gate),
        "sourceRoot": str(source),
        "sourceCommit": commit,
        "accountHome": "/tmp/codex-fourth",
        "workspaceRoot": str(workspace_root),
        "schedulerCommand": command,
        "claimPath": str(root / "repair.claim.json"),
        "artifacts": {
            name: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for name, path in artifact_paths.items()
        },
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    manifest_path.chmod(0o600)
    return gate, fleet, manifest_path, manifest, command


class OfficialSymphonyContractTests(unittest.TestCase):
    def test_live_queue_budget_and_no_root_workflow(self):
        """Official runtime is ~/.config/symphony/WORKFLOW.md; product clone is not a Symphony config."""
        helper = _load_helper()
        self.assertFalse((ROOT / "WORKFLOW.md").exists())
        self.assertFalse((ROOT / "scripts/symphony/systemd/symphony-burrito.service").exists())
        self.assertFalse((ROOT / "scripts/symphony/systemd/symphony-burrito-update.service").exists())
        self.assertFalse((ROOT / "scripts/symphony/systemd/symphony-burrito-update.timer").exists())
        self.assertTrue(WORKFLOW_PATH.is_file())
        self.assertTrue(UNIT_PATH.is_file())
        self.assertIn("%h/.config/symphony/WORKFLOW.md", UNIT)
        self.assertIn(f'team_key: "{LIVE_TEAM_KEY}"', WORKFLOW)
        self.assertNotIn("project_slug", WORKFLOW)
        self.assertNotIn("jovie-ba6736cbfbb9", WORKFLOW)
        self.assertIn("root: ~/symphony-elixir-workspaces", WORKFLOW)
        self.assertIn("timeout_ms: 900000", WORKFLOW)
        self.assertIn("max_concurrent_agents: 8", WORKFLOW)
        self.assertIn("api_key: $LINEAR_API_KEY", WORKFLOW)
        self.assertNotIn("required_labels:", WORKFLOW)
        self.assertIn("excluded_labels:", WORKFLOW)
        self.assertIn("    - no-symphony", WORKFLOW)
        self.assertIn("    - needs-human", WORKFLOW)
        self.assertRegex(
            WORKFLOW,
            re.compile(r"^\s+command: \./scripts/symphony/symphony-codex-router app-server$", re.M),
        )
        self.assertNotIn("codex app-server", WORKFLOW)
        self.assertIn("symphony-routing/v1", WORKFLOW)
        hook = WORKFLOW.split("after_create:", 1)[1].split("agent:", 1)[0]
        self.assertIn("git clone --depth 1 https://github.com/JovieInc/Jovie.git .", hook)
        self.assertTrue("git@" not in hook and "mix " not in hook)
        self.assertIn("symphony-nvme-package-cache.sh after-create", hook)
        self.assertIn("pnpm install --offline --frozen-lockfile --ignore-scripts", WORKFLOW)
        self.assertIn("before_remove:", WORKFLOW)
        self.assertIn("symphony-nvme-package-cache.sh before-remove", WORKFLOW)
        self.assertIn("git + gh CLI only", WORKFLOW)
        self.assertIn("76869538009648d5b282a4bb21c3d157", WORKFLOW)
        self.assertIn("enabled=false", WORKFLOW)
        self.assertIn("create_branch", WORKFLOW)
        self.assertIn("- Merging", WORKFLOW)
        self.assertIn("- Rework", WORKFLOW)
        self.assertNotIn("team:JOV", WORKFLOW)
        self.assertIsNone(TOKEN_RE.search(WORKFLOW))
        self.assertIn("--port 4041", UNIT)
        self.assertIn("symphony-elixir-logs", UNIT)
        self.assertIn("symphony-official-runtime run", UNIT)
        self.assertIn("--max-gate-sleep-seconds 3900", UNIT)
        self.assertNotIn("ExecStartPre=%h/.local/bin/symphony-official-runtime reset-gate", UNIT)
        self.assertIn(
            "--i-understand-that-this-will-be-running-without-the-usual-guardrails",
            UNIT,
        )
        self.assertNotIn("--port 4043", UNIT)
        self.assertNotIn("symphony-burrito", UNIT)
        self.assertNotIn("symphony-lyb.service", UNIT)
        self.assertIn("Restart=always", UNIT)
        self.assertIn(
            "EnvironmentFile=%h/.config/symphony/codex-account.env", UNIT
        )
        self.assertNotIn("Environment=CODEX_HOME=", UNIT)
        self.assertNotIn("ExecStartPre=", UNIT)
        self.assertIn("SuccessExitStatus=0 1", UNIT)
        self.assertIn("StandardOutput=journal", UNIT)
        self.assertNotIn("tty1", UNIT)
        result = helper.validate_source(
            repo_root=ROOT,
            workflow_path=WORKFLOW_PATH,
            unit_path=UNIT_PATH,
            service_name="symphony-elixir.service",
            active_issues=helper.MEASURED_ACTIVE_ISSUES,
        )
        self.assertTrue(result["ok"], result)
        budget = result["budget"]
        self.assertEqual(budget["pagesPerPoll"], 4)
        self.assertEqual(budget["schedulerRequestsPerHour"], 480)
        self.assertLessEqual(budget["steadyStateRequestsPerHour"], 2500)
        missing_count = helper.validate_source(
            repo_root=ROOT,
            workflow_path=WORKFLOW_PATH,
            unit_path=UNIT_PATH,
            service_name="symphony-elixir.service",
        )
        self.assertFalse(missing_count["ok"], missing_count)
        self.assertIn("linear_active_issue_count_missing", missing_count["errors"])

    def test_budget_fails_for_five_second_polling_or_unbounded_concurrency(self):
        helper = _load_helper()
        unsafe_interval = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=5000, max_concurrent_agents=8)
        )
        self.assertFalse(unsafe_interval["withinBudget"])
        self.assertEqual(unsafe_interval["schedulerRequestsPerHour"], 2880)
        safe = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=30000, max_concurrent_agents=8)
        )
        self.assertTrue(safe["withinBudget"], safe)
        self.assertEqual(safe["schedulerRequestsPerHour"], 480)
        self.assertEqual(safe["steadyStateRequestsPerHour"], 1220)
        unsafe_concurrency = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=30000, max_concurrent_agents=55)
        )
        self.assertFalse(unsafe_concurrency["withinBudget"])
        live_queue_edge = helper.compute_budget(
            helper.BudgetInputs(
                active_issues=701,
                poll_interval_ms=30000,
                max_concurrent_agents=8,
            )
        )
        self.assertFalse(live_queue_edge["withinBudget"], live_queue_edge)
        self.assertEqual(live_queue_edge["steadyStateRequestsPerHour"], 2540)
        measured_safe_edge = helper.compute_budget(
            helper.BudgetInputs(
                active_issues=700,
                poll_interval_ms=30000,
                max_concurrent_agents=8,
            )
        )
        self.assertTrue(measured_safe_edge["withinBudget"], measured_safe_edge)
        self.assertEqual(measured_safe_edge["steadyStateRequestsPerHour"], 2420)

    def test_linear_graphql_ratelimited_400_records_retry_after_gate(self):
        helper = _load_helper()
        now = helper.dt.datetime(2026, 8, 31, 15, 0, 0, tzinfo=helper.dt.timezone.utc)
        body = '{"errors":[{"message":"request budget exhausted","extensions":{"code":"RATELIMITED"}}]}'
        classified = helper.classify_linear_response(
            status=400,
            headers={"retry-after": "3600"},
            body=body,
            now=now,
        )
        self.assertEqual(classified["kind"], "rate_limited")
        self.assertEqual(classified["source"], "linear_graphql_ratelimited")
        self.assertEqual(classified["retryAfterSeconds"], 3600)
        self.assertEqual(classified["resetAt"], "2026-08-31T16:00:00Z")
        ordinary = helper.classify_linear_response(
            status=400,
            headers={"retry-after": "3600"},
            body='{"errors":[{"message":"Variable issueId is invalid"}]}',
            now=now,
        )
        self.assertEqual(ordinary["kind"], "bad_request")
        self.assertIsNone(ordinary["resetAt"])
        missing_retry_after = helper.classify_linear_response(
            status=429,
            headers={},
            body="",
            now=now,
        )
        self.assertEqual(missing_retry_after["kind"], "rate_limited")
        self.assertEqual(missing_retry_after["retryAfterSeconds"], 3600)
        self.assertEqual(missing_retry_after["resetAt"], "2026-08-31T16:00:00Z")
        original_parser = helper.parsedate_to_datetime
        try:
            helper.parsedate_to_datetime = lambda _value: (_ for _ in ()).throw(
                IndexError("malformed date")
            )
            malformed_retry_after = helper.classify_linear_response(
                status=400,
                headers={"retry-after": "Thu, definitely not a date GMT"},
                body=body,
                now=now,
            )
        finally:
            helper.parsedate_to_datetime = original_parser
        self.assertEqual(malformed_retry_after["kind"], "rate_limited")
        self.assertEqual(malformed_retry_after["retryAfterSeconds"], 3600)
        self.assertEqual(malformed_retry_after["resetAt"], "2026-08-31T16:00:00Z")
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "linear-rate-limit.json"
            self.assertTrue(helper.write_rate_limit_gate(gate, classified))
            active = helper.read_rate_limit_gate(
                gate,
                now=helper.dt.datetime(2026, 8, 31, 15, 1, 0, tzinfo=helper.dt.timezone.utc),
            )
            self.assertTrue(active["active"])
            self.assertEqual(active["retryAfterSeconds"], 3540)

    def test_official_runtime_wrapper_records_logged_rate_limit_gate(self):
        helper = _load_helper()
        now = helper.dt.datetime(2026, 8, 31, 15, 0, 0, tzinfo=helper.dt.timezone.utc)
        line = (
            'status=400 retry-after: 3600 '
            '{"errors":[{"message":"request budget exhausted",'
            '"extensions":{"code":"RATELIMITED"}}]}'
        )
        classified = helper.classify_linear_log_line(line, now=now)
        self.assertIsNotNone(classified)
        assert classified is not None
        self.assertEqual(classified["kind"], "rate_limited")
        self.assertEqual(classified["resetAt"], "2026-08-31T16:00:00Z")
        self.assertIsNone(
            helper.classify_linear_log_line(
                'status=400 retry-after: 3600 {"errors":[{"message":"bad variable"}]}',
                now=now,
            )
        )
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "linear-rate-limit.json"
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(gate),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    f"print({line!r})",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, helper.RATE_LIMIT_EXIT_CODE)
            payload = json.loads(gate.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema"], helper.RATE_LIMIT_GATE_SCHEMA)
            self.assertEqual(payload["kind"], "rate_limited")

    def test_final_rate_limit_line_is_drained_after_root_exit(self):
        helper = _load_helper()
        original_queue = helper.queue.Queue
        created = []

        class DelayedPublicationQueue(original_queue):
            def put(self, item, *args, **kwargs):
                if not item[0]:
                    time.sleep(0.25)
                return super().put(item, *args, **kwargs)

        def queue_factory(*, maxsize):
            created.append(maxsize)
            return DelayedPublicationQueue(maxsize=maxsize)

        line = (
            'status=400 retry-after: 3600 '
            '{"errors":[{"extensions":{"code":"RATELIMITED"}}]}'
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            receipt = root / "fleet-gate.json"
            receipt.write_text(json.dumps(_fleet_gate_payload()))
            gate = root / "linear-rate-limit.json"
            closure = helper.ClosureStopLine(
                receipt_path=receipt,
                hold_receipt_path=root / "closure-hold.json",
                dead_letter_dir=root / "dead-letters",
            )
            with contextlib.redirect_stdout(io.StringIO()), mock.patch.object(
                helper.queue, "Queue", side_effect=queue_factory
            ):
                returncode = helper.run_official_binary_once(
                    ["python3", "-c", f"print({line!r})"], gate_file=gate,
                    closure=closure, max_gate_sleep_seconds=0,
                )
            self.assertEqual(returncode, helper.RATE_LIMIT_EXIT_CODE)
            self.assertTrue(gate.is_file())
            self.assertEqual(created, [helper.RUNTIME_OUTPUT_QUEUE_MAX_LINES])

    def test_rate_limit_pause_keeps_noisy_output_queue_bounded(self):
        helper = _load_helper()
        original_queue = helper.queue.Queue
        observed = []

        class ObservedQueue(original_queue):
            def put(self, item, *args, **kwargs):
                result = super().put(item, *args, **kwargs)
                observed.append(self.qsize())
                return result

        line = 'status=429 {"errors":[{"extensions":{"code":"RATELIMITED"}}]}'
        script = f"print({line!r}); [print('noise-' + str(i)) for i in range(2000)]"
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            receipt = root / "fleet-gate.json"
            receipt.write_text(json.dumps(_fleet_gate_payload()))
            closure = helper.ClosureStopLine(
                receipt_path=receipt,
                hold_receipt_path=root / "closure-hold.json",
                dead_letter_dir=root / "dead-letters",
            )
            with contextlib.redirect_stdout(io.StringIO()), mock.patch.object(
                helper.queue, "Queue",
                side_effect=lambda *, maxsize: ObservedQueue(maxsize=maxsize),
            ), mock.patch.object(
                helper, "_pause_child_for_gate",
                side_effect=lambda *_args, **_kwargs: time.sleep(0.2),
            ):
                returncode = helper.run_official_binary_once(
                    ["python3", "-c", script],
                    gate_file=root / "linear-rate-limit.json",
                    closure=closure,
                    max_gate_sleep_seconds=1,
                )
            self.assertEqual(returncode, helper.RATE_LIMIT_EXIT_CODE)
            self.assertLessEqual(max(observed), helper.RUNTIME_OUTPUT_QUEUE_MAX_LINES)

    def test_team_scope_validation_fails_closed(self):
        """Malformed or legacy project-gated scope stops dispatch validation."""
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            variant = pathlib.Path(tmp) / "WORKFLOW.md"

            def check(text):
                variant.write_text(text, encoding="utf-8")
                return helper.validate_source(
                    repo_root=ROOT,
                    workflow_path=variant,
                    unit_path=UNIT_PATH,
                    service_name="symphony-elixir.service",
                    active_issues=helper.MEASURED_ACTIVE_ISSUES,
                )

            malformed = check(WORKFLOW.replace('team_key: "JOV"', 'team_key: "jov"'))
            self.assertFalse(malformed["ok"])
            self.assertIn(
                "workflow_invalid:malformed tracker.provider.team_key:jov",
                malformed["errors"],
            )

            missing = check(
                WORKFLOW.replace('    team_key: "JOV"\n', "")
            )
            self.assertFalse(missing["ok"])
            self.assertIn(
                "workflow_invalid:missing tracker.provider.team_key", missing["errors"]
            )

            wrong_team = check(WORKFLOW.replace('team_key: "JOV"', 'team_key: "LYB"'))
            self.assertFalse(wrong_team["ok"])
            self.assertIn("workflow_team_key:LYB", wrong_team["errors"])

            project_gated = check(
                WORKFLOW.replace(
                    '    team_key: "JOV"',
                    '    team_key: "JOV"\n    project_slug: "symphony-ui-pilot-96d6b9c5b2d5"',
                )
            )
            self.assertFalse(project_gated["ok"])
            self.assertTrue(
                any(
                    error.startswith("workflow_project_slug_present:")
                    for error in project_gated["errors"]
                ),
                project_gated["errors"],
            )

            labeled = check(
                WORKFLOW.replace(
                    "  excluded_labels:\n",
                    "  required_labels:\n    - symphony\n  excluded_labels:\n",
                )
            )
            self.assertFalse(labeled["ok"])
            self.assertIn("workflow_required_labels_present:symphony", labeled["errors"])

            nonadjacent_duplicate = check(
                WORKFLOW.replace(
                    "  excluded_labels:\n    - no-symphony\n    - needs-human\n",
                    "  required_labels:\n"
                    "    - first\n"
                    "  excluded_labels:\n"
                    "    - no-symphony\n"
                    "    - needs-human\n"
                    "  required_labels:\n"
                    "    - second\n",
                )
            )
            self.assertFalse(nonadjacent_duplicate["ok"])
            self.assertIn(
                "workflow_invalid:duplicate list required_labels",
                nonadjacent_duplicate["errors"],
            )

            no_exclusions = check(
                WORKFLOW.replace(
                    "  excluded_labels:\n    - no-symphony\n    - needs-human\n", ""
                )
            )
            self.assertFalse(no_exclusions["ok"])
            self.assertIn(
                "workflow_excluded_label_missing:no-symphony", no_exclusions["errors"]
            )
            self.assertIn(
                "workflow_excluded_label_missing:needs-human", no_exclusions["errors"]
            )

            missing_rework = check(WORKFLOW.replace("    - Rework\n", ""))
            self.assertFalse(missing_rework["ok"])
            self.assertTrue(
                any(
                    error.startswith("workflow_active_states:")
                    for error in missing_rework["errors"]
                ),
                missing_rework["errors"],
            )

    def test_workflow_executable_sources_reject_missing_nonexec_and_symlink(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp) / "repo"
            scripts = repo / "scripts/symphony"
            scripts.mkdir(parents=True)
            router = scripts / "symphony-codex-router"
            cache = scripts / "symphony-nvme-package-cache.sh"
            router.write_bytes((ROOT / "scripts/symphony/symphony-codex-router").read_bytes())
            cache.write_bytes((ROOT / "scripts/symphony/symphony-nvme-package-cache.sh").read_bytes())
            router.chmod(0o755)
            cache.chmod(0o755)

            def validate():
                return helper.validate_source(
                    repo_root=repo,
                    workflow_path=WORKFLOW_PATH,
                    unit_path=UNIT_PATH,
                    service_name="symphony-elixir.service",
                    active_issues=helper.MEASURED_ACTIVE_ISSUES,
                )

            self.assertTrue(validate()["ok"])
            router.chmod(0o644)
            self.assertIn(
                "workflow_executable_invalid:./scripts/symphony/symphony-codex-router",
                validate()["errors"],
            )
            router.unlink()
            self.assertIn(
                "workflow_executable_invalid:./scripts/symphony/symphony-codex-router",
                validate()["errors"],
            )
            outside = pathlib.Path(tmp) / "outside-router"
            outside.write_text("#!/bin/sh\n")
            outside.chmod(0o755)
            router.symlink_to(outside)
            self.assertIn(
                "workflow_executable_invalid:./scripts/symphony/symphony-codex-router",
                validate()["errors"],
            )

    def test_linear_eligible_count_uses_team_key_pagination(self):
        helper = _load_helper()
        calls = []

        class FakeResponse:
            status = 200
            headers = {}

            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps(self.payload).encode("utf-8")

        def fake_urlopen(request, timeout):
            del timeout
            payload = json.loads(request.data.decode("utf-8"))
            calls.append(payload)
            after = payload["variables"]["after"]
            if after is None:
                return FakeResponse(
                    {
                        "data": {
                            "issues": {
                                "nodes": [
                                    {"id": "issue-1"},
                                    {"id": "issue-2"},
                                    {"id": "issue-3"},
                                ],
                                "pageInfo": {
                                    "hasNextPage": True,
                                    "endCursor": "cursor-1",
                                },
                            }
                        }
                    }
                )
            return FakeResponse(
                {
                    "data": {
                        "issues": {
                            "nodes": [
                                {"id": "issue-4"},
                                {"id": "issue-5"},
                            ],
                            "pageInfo": {
                                "hasNextPage": False,
                                "endCursor": None,
                            },
                        }
                    }
                }
            )

        with mock.patch.object(helper.urllib.request, "urlopen", side_effect=fake_urlopen):
            count = helper.fetch_linear_eligible_issue_count(api_key="lin_test")

        self.assertEqual(count, 5)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["variables"]["teamKey"], helper.OFFICIAL_TEAM_KEY)
        self.assertEqual(
            calls[0]["variables"]["stateNames"], list(helper.ACTIVE_STATES)
        )
        self.assertNotIn("projectId", calls[0]["variables"])
        self.assertNotIn("projectSlug", calls[0]["variables"])

    def test_linear_eligible_count_rejects_malformed_team_key(self):
        helper = _load_helper()
        with self.assertRaises(ValueError):
            helper.fetch_linear_eligible_issue_count(
                api_key="lin_test", team_key="jov"
            )

    def test_rate_limit_gate_closes_descriptor_when_fdopen_fails(self):
        helper = _load_helper()
        classified = {
            "kind": "rate_limited",
            "status": 429,
            "source": "linear_transport",
            "retryAfterSeconds": 3600,
            "resetAt": "2026-08-31T16:00:00Z",
            "recordedAt": "2026-08-31T15:00:00Z",
        }
        original_fdopen = helper.os.fdopen
        original_close = helper.os.close
        attempted = []
        closed = []

        def fail_fdopen(fd, *args, **kwargs):
            attempted.append(fd)
            raise OSError(f"fdopen failed for {fd}")

        def record_close(fd):
            closed.append(fd)
            return original_close(fd)

        with tempfile.TemporaryDirectory() as tmp:
            try:
                helper.os.fdopen = fail_fdopen
                helper.os.close = record_close
                gate = pathlib.Path(tmp) / "linear-rate-limit.json"
                with self.assertRaises(OSError):
                    helper.write_rate_limit_gate(gate, classified)
            finally:
                helper.os.fdopen = original_fdopen
                helper.os.close = original_close
            self.assertFalse(gate.exists())
            self.assertEqual(len(attempted), 1)
            self.assertEqual(closed.count(attempted[0]), 1)

    def test_official_runtime_wrapper_records_gate_without_terminating_child(self):
        helper = _load_helper()
        source = HELPER_PATH.read_text(encoding="utf-8")
        self.assertIn("signal.SIGSTOP", source)
        self.assertIn("signal.SIGCONT", source)
        self.assertNotIn("_terminate_child", source)
        line = (
            'status=400 retry-after: 3600 '
            '{"errors":[{"message":"request budget exhausted",'
            '"extensions":{"code":"RATELIMITED"}}]}'
        )
        script = (
            "import sys\n"
            f"print({line!r})\n"
            "sys.stdout.flush()\n"
            "print('child-drained-after-rate-limit')\n"
            "sys.stdout.flush()\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "linear-rate-limit.json"
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(gate),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    script,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, helper.RATE_LIMIT_EXIT_CODE)
            self.assertIn("child-drained-after-rate-limit", result.stdout)
            self.assertTrue(gate.is_file())

    def test_official_runtime_wrapper_pauses_live_scheduler_without_terminating_child(self):
        helper = _load_helper()
        process = subprocess.Popen(
            ["python3", "-c", "import time; time.sleep(30)"],
            cwd=ROOT,
            text=True,
        )
        kills = []
        sleeps = []

        def fake_kill(pid, sig):
            kills.append((pid, sig))

        def fake_sleep(seconds):
            sleeps.append(seconds)

        original_sleep = helper.time.sleep
        try:
            helper.time.sleep = fake_sleep
            with mock.patch.object(helper.os, "kill", side_effect=fake_kill):
                slept = helper._pause_child_for_gate(
                    process,
                    {
                        "active": True,
                        "retryAfterSeconds": 3600,
                        "resetAt": "2026-08-31T16:00:00Z",
                    },
                    20,
                )
        finally:
            helper.time.sleep = original_sleep
            process.terminate()
            process.wait(timeout=5)

        self.assertEqual(slept, 20)
        self.assertEqual(sleeps, [20])
        self.assertEqual(kills, [(process.pid, helper.signal.SIGSTOP), (process.pid, helper.signal.SIGCONT)])

    def test_official_runtime_wrapper_forwards_term_to_child_process_group(self):
        child_program = r"""
import os, pathlib, signal, subprocess, sys, time
child_receipt = pathlib.Path(sys.argv[1])
grandchild_receipt = pathlib.Path(sys.argv[2])
grandchild_program = '''
import os, pathlib, signal, sys, time
receipt = pathlib.Path(sys.argv[1])
signal.signal(signal.SIGTERM, lambda *_: (receipt.write_text("term"), sys.exit(0)))
print(f"grandchild-ready {os.getpid()}", flush=True)
while True: time.sleep(1)
'''
subprocess.Popen([sys.executable, "-c", grandchild_program, str(grandchild_receipt)])
signal.signal(signal.SIGTERM, lambda *_: (child_receipt.write_text("term"), sys.exit(0)))
print(f"child-ready {os.getpid()}", flush=True)
while True: time.sleep(1)
"""
        with tempfile.TemporaryDirectory() as tmp:
            child_receipt = pathlib.Path(tmp) / "child-term"
            grandchild_receipt = pathlib.Path(tmp) / "grandchild-term"
            process = subprocess.Popen(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    child_program,
                    str(child_receipt),
                    str(grandchild_receipt),
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            try:
                assert process.stdout is not None
                ready = [
                    process.stdout.readline().strip(),
                    process.stdout.readline().strip(),
                ]
                pids = {
                    kind: int(pid)
                    for kind, pid in (line.split() for line in ready)
                }
                self.assertEqual(set(pids), {"child-ready", "grandchild-ready"})
                os.killpg(pids["child-ready"], signal.SIGSTOP)
                os.kill(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
                for _ in range(50):
                    if child_receipt.is_file() and grandchild_receipt.is_file():
                        break
                    time.sleep(0.02)
                self.assertEqual(child_receipt.read_text(), "term")
                self.assertEqual(grandchild_receipt.read_text(), "term")
                for _ in range(100):
                    survivors = []
                    for pid in pids.values():
                        try:
                            os.kill(pid, 0)
                        except ProcessLookupError:
                            continue
                        survivors.append(pid)
                    if not survivors:
                        break
                    time.sleep(0.02)
                self.assertEqual(survivors, [])
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=5)
                if process.stdout is not None:
                    process.stdout.close()

    def test_term_interrupts_live_rate_gate_and_kills_resistant_child(self):
        line = (
            'status=400 retry-after: 3600 '
            '{"errors":[{"message":"request budget exhausted",'
            '"extensions":{"code":"RATELIMITED"}}]}'
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            pid_file = root / "child.pid"
            gate = root / "gate.json"
            child = (
                "import os,pathlib,signal,sys,time; "
                "pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); "
                "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                f"print({line!r}, flush=True); time.sleep(3600)"
            )
            wrapper = subprocess.Popen(
                [
                    "python3", str(HELPER_PATH), "run", "--gate-file", str(gate),
                    *_closure_run_args(tmp), "--max-gate-sleep-seconds", "3900",
                    "--", "python3", "-c", child, str(pid_file),
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                deadline = time.time() + 5
                while not gate.exists() and time.time() < deadline:
                    time.sleep(0.02)
                self.assertTrue(gate.exists())
                child_pid = int(pid_file.read_text())
                started = time.monotonic()
                os.kill(wrapper.pid, signal.SIGTERM)
                wrapper.wait(timeout=6)
                self.assertLess(time.monotonic() - started, 5.5)
                with self.assertRaises(ProcessLookupError):
                    os.kill(child_pid, 0)
            finally:
                if wrapper.poll() is None:
                    wrapper.kill()
                wrapper.wait(timeout=5)
                if wrapper.stdout is not None:
                    wrapper.stdout.close()
                if wrapper.stderr is not None:
                    wrapper.stderr.close()

    def test_invalid_shutdown_grace_never_starts_official_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            started = root / "started"
            child = (
                "import pathlib,sys,time; "
                "pathlib.Path(sys.argv[1]).write_text('started'); time.sleep(30)"
            )
            for invalid in ("invalid", "nan", "inf", "-1", "0"):
                with self.subTest(value=invalid):
                    started.unlink(missing_ok=True)
                    result = subprocess.run(
                        [
                            "python3", str(HELPER_PATH), "run",
                            "--gate-file", str(root / "gate"),
                            *_closure_run_args(tmp),
                            "--max-gate-sleep-seconds", "0",
                            "--", "python3", "-c", child, str(started),
                        ],
                        cwd=ROOT,
                        env={
                            **os.environ,
                            "SYMPHONY_SHUTDOWN_GRACE_SECONDS": invalid,
                        },
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(started.exists())

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_normal_exit_reaps_noisy_detached_stdout_holder_before_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            pid_file = root / "detached.pid"
            child = r'''
import pathlib, signal, subprocess, sys
grand = subprocess.Popen([
    sys.executable, "-c",
    "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
    "exec(\"while True:\\n print('detached-noise',flush=True)\\n time.sleep(.01)\")",
], start_new_session=True)
pathlib.Path(sys.argv[1]).write_text(str(grand.pid))
print("normal exit", flush=True)
'''
            result = subprocess.run(
                ["python3", str(HELPER_PATH), "run", "--gate-file", str(root / "gate"),
                 *_closure_run_args(tmp), "--max-gate-sleep-seconds", "0", "--",
                 "python3", "-c", child, str(pid_file)],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "0.2"},
                capture_output=True,
                text=True,
                timeout=6,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("normal exit", result.stdout)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pid_file.read_text()), 0)

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_normal_exit_reaps_continuously_logging_detached_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            pid_file = root / "detached.pid"
            child = r'''
import pathlib, subprocess, sys
grand = subprocess.Popen([
    sys.executable, "-c",
    "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN);\n"
    "while True: print('descendant-output', flush=True); time.sleep(0.001)",
], start_new_session=True)
pathlib.Path(sys.argv[1]).write_text(str(grand.pid))
print("normal exit", flush=True)
'''
            wrapper = subprocess.Popen(
                ["python3", str(HELPER_PATH), "run", "--gate-file", str(root / "gate"),
                 *_closure_run_args(tmp), "--max-gate-sleep-seconds", "0", "--",
                 "python3", "-c", child, str(pid_file)],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "0.2"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                stdout, stderr = wrapper.communicate(timeout=3)
                self.assertEqual(wrapper.returncode, 0, stderr)
                self.assertIn("normal exit", stdout)
                self.assertIn("descendant-output", stdout)
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(pid_file.read_text()), 0)
            finally:
                if wrapper.poll() is None:
                    wrapper.terminate()
                    try:
                        wrapper.communicate(timeout=3)
                    except subprocess.TimeoutExpired:
                        wrapper.kill()
                        wrapper.communicate(timeout=3)
                if pid_file.exists():
                    try:
                        os.kill(int(pid_file.read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                for stream in (wrapper.stdout, wrapper.stderr):
                    if stream is not None:
                        stream.close()

    def test_root_pidfd_failure_never_launches_workload(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            started = root / "started"
            receipt = root / "fleet-gate.json"
            receipt.write_text(json.dumps(_fleet_gate_payload()))
            libc = mock.Mock()
            libc.prctl.return_value = 0
            with mock.patch.object(helper.sys, "platform", "linux"), mock.patch.object(
                helper.ctypes, "CDLL", return_value=libc
            ), mock.patch.object(
                helper.os, "pidfd_open", side_effect=OSError(24, "injected"), create=True
            ), self.assertRaisesRegex(RuntimeError, "cannot pin process identity"):
                helper.run_official_binary_once(
                    ["python3", "-c", f"open({str(started)!r}, 'w').close()"],
                    gate_file=root / "linear-rate-limit.json",
                    closure=helper.ClosureStopLine(
                        receipt_path=receipt,
                        hold_receipt_path=root / "closure-hold.json",
                        dead_letter_dir=root / "dead-letters",
                    ),
                    max_gate_sleep_seconds=0,
                )
            self.assertFalse(started.exists())

    def test_partial_pidfd_reserve_is_closed_when_launch_pipe_fails(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            receipt = root / "fleet-gate.json"
            receipt.write_text(json.dumps(_fleet_gate_payload()))
            libc = mock.Mock()
            libc.prctl.return_value = 0
            real_open = os.open
            opened: list[int] = []

            def partial_reserve_open(path, flags):
                if len(opened) == 2:
                    raise OSError(24, "injected partial reserve exhaustion")
                descriptor = real_open(path, flags)
                opened.append(descriptor)
                return descriptor

            with mock.patch.object(helper.sys, "platform", "linux"), mock.patch.object(
                helper.ctypes, "CDLL", return_value=libc
            ), mock.patch.object(
                helper.os, "open", side_effect=partial_reserve_open
            ), mock.patch.object(
                helper.os, "pipe", side_effect=OSError(24, "injected pipe exhaustion")
            ), mock.patch.object(helper.subprocess, "Popen") as popen, self.assertRaisesRegex(
                OSError, "injected pipe exhaustion"
            ):
                helper.run_official_binary_once(
                    ["python3", "-c", "raise SystemExit(0)"],
                    gate_file=root / "linear-rate-limit.json",
                    closure=helper.ClosureStopLine(
                        receipt_path=receipt,
                        hold_receipt_path=root / "closure-hold.json",
                        dead_letter_dir=root / "dead-letters",
                    ),
                    max_gate_sleep_seconds=0,
                )
            self.assertEqual(len(opened), 2)
            popen.assert_not_called()
            for descriptor in opened:
                with self.assertRaises(OSError):
                    os.fstat(descriptor)

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_wide_descendant_tree_reuses_pidfd_slot_without_numeric_signal(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            child_pids = root / "child.pids"
            receipt = root / "fleet-gate.json"
            receipt.write_text(json.dumps(_fleet_gate_payload()))
            child = (
                "import os,pathlib,subprocess,sys; "
                "ps=[subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],"
                "start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) "
                "for _ in range(12)]; "
                "pathlib.Path(sys.argv[1]).write_text(' '.join(str(p.pid) for p in ps))"
            )
            real_pidfd_open = os.pidfd_open
            real_close = os.close
            launched = []
            tracked_pidfds = set()
            real_popen = helper.subprocess.Popen

            def recording_popen(*args, **kwargs):
                process = real_popen(*args, **kwargs)
                launched.append(process)
                return process

            def selective_pidfd(pid):
                # Model a process with room for only the permanent root pidfd
                # plus one reusable descendant slot. Accumulating descendant
                # pidfds would fail before this tree can be contained.
                if len(tracked_pidfds) >= 2:
                    raise OSError(24, "injected descendant pidfd exhaustion")
                descriptor = real_pidfd_open(pid)
                tracked_pidfds.add(descriptor)
                return descriptor

            def tracking_close(descriptor):
                tracked_pidfds.discard(descriptor)
                return real_close(descriptor)

            real_kill = os.kill
            signals = []

            def recording_kill(pid, signum):
                signals.append((pid, signum))
                return real_kill(pid, signum)

            with mock.patch.object(
                helper.subprocess, "Popen", side_effect=recording_popen
            ), mock.patch.object(
                helper.os, "pidfd_open", side_effect=selective_pidfd
            ), mock.patch.object(
                helper.os, "close", side_effect=tracking_close
            ), mock.patch.object(helper.os, "kill", side_effect=recording_kill):
                self.assertEqual(helper.run_official_binary_once(
                    ["python3", "-c", child, str(child_pids)],
                    gate_file=root / "linear-rate-limit.json",
                    closure=helper.ClosureStopLine(
                        receipt_path=receipt,
                        hold_receipt_path=root / "closure-hold.json",
                        dead_letter_dir=root / "dead-letters",
                    ),
                    max_gate_sleep_seconds=0,
                ), 0)
            detached = [int(value) for value in child_pids.read_text().split()]
            self.assertEqual(len(detached), 12)
            self.assertFalse(any(pid in detached for pid, _ in signals))
            for pid in detached:
                with self.assertRaises(ProcessLookupError):
                    real_kill(pid, 0)

    def test_term_kills_detached_resistant_stdout_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            pids = root / "pids"
            child = r'''
import os, pathlib, signal, subprocess, sys, time
grand = subprocess.Popen([
    sys.executable, "-c",
    "import os,signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print(os.getpid(), flush=True); time.sleep(3600)",
], start_new_session=True, stdout=subprocess.PIPE, text=True)
grand_pid = int(grand.stdout.readline().strip())
pathlib.Path(sys.argv[1]).write_text(f"{os.getpid()} {grand_pid}")
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
print("ready", flush=True)
while True: time.sleep(1)
'''
            wrapper = subprocess.Popen(
                [
                    "python3", str(HELPER_PATH), "run", "--gate-file", str(root / "gate"),
                    *_closure_run_args(tmp), "--max-gate-sleep-seconds", "0",
                    "--", "python3", "-c", child, str(pids),
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                assert wrapper.stdout is not None
                self.assertEqual(wrapper.stdout.readline().strip(), "ready")
                captured = [int(value) for value in pids.read_text().split()]
                os.kill(wrapper.pid, signal.SIGTERM)
                wrapper.wait(timeout=6)
                for pid in captured:
                    with self.assertRaises(ProcessLookupError):
                        os.kill(pid, 0)
            finally:
                if wrapper.poll() is None:
                    wrapper.kill()
                wrapper.wait(timeout=5)
                if wrapper.stdout is not None:
                    wrapper.stdout.close()
                if wrapper.stderr is not None:
                    wrapper.stderr.close()

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_term_catches_late_detached_fork_after_parent_signal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            late_pid = root / "late.pid"
            child = r'''
import os, pathlib, signal, subprocess, sys, time
def terminate(*_):
    grand = subprocess.Popen([
        sys.executable, "-c",
        "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(3600)",
    ], start_new_session=True)
    pathlib.Path(sys.argv[1]).write_text(str(grand.pid))
    raise SystemExit(0)
signal.signal(signal.SIGTERM, terminate)
print("ready", flush=True)
while True: time.sleep(1)
'''
            wrapper = subprocess.Popen(
                [
                    "python3", str(HELPER_PATH), "run", "--gate-file", str(root / "gate"),
                    *_closure_run_args(tmp), "--max-gate-sleep-seconds", "0",
                    "--", "python3", "-c", child, str(late_pid),
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                assert wrapper.stdout is not None
                self.assertEqual(wrapper.stdout.readline().strip(), "ready")
                os.kill(wrapper.pid, signal.SIGTERM)
                wrapper.wait(timeout=6)
                deadline = time.time() + 2
                while not late_pid.exists() and time.time() < deadline:
                    time.sleep(0.02)
                self.assertTrue(late_pid.exists())
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(late_pid.read_text()), 0)
            finally:
                if wrapper.poll() is None:
                    wrapper.kill()
                wrapper.wait(timeout=5)
                if wrapper.stdout is not None:
                    wrapper.stdout.close()
                if wrapper.stderr is not None:
                    wrapper.stderr.close()

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires Linux subreaper")
    def test_term_catches_detached_fork_at_grace_deadline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            late_pid = root / "deadline.pid"
            child = r'''
import pathlib, signal, subprocess, sys, time
def terminate(*_):
    time.sleep(0.095)
    grand = subprocess.Popen([
        sys.executable, "-c",
        "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(3600)",
    ], start_new_session=True)
    pathlib.Path(sys.argv[1]).write_text(str(grand.pid))
    raise SystemExit(0)
signal.signal(signal.SIGTERM, terminate)
print("ready", flush=True)
while True: time.sleep(1)
'''
            wrapper = subprocess.Popen(
                [
                    "python3", str(HELPER_PATH), "run", "--gate-file", str(root / "gate"),
                    *_closure_run_args(tmp), "--max-gate-sleep-seconds", "0",
                    "--", "python3", "-c", child, str(late_pid),
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_SHUTDOWN_GRACE_SECONDS": "0.1"},
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                assert wrapper.stdout is not None
                self.assertEqual(wrapper.stdout.readline().strip(), "ready")
                os.kill(wrapper.pid, signal.SIGTERM)
                wrapper.wait(timeout=5)
                self.assertTrue(late_pid.exists())
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(late_pid.read_text()), 0)
            finally:
                if wrapper.poll() is None:
                    wrapper.kill()
                wrapper.wait(timeout=5)
                if wrapper.stdout is not None:
                    wrapper.stdout.close()
                if wrapper.stderr is not None:
                    wrapper.stderr.close()

    def test_unit_binds_closure_stop_line_gate(self):
        helper = _load_helper()
        self.assertLess(helper.MAX_SHUTDOWN_GRACE_SECONDS, 15)
        self.assertEqual(helper.DEFAULT_SHUTDOWN_GRACE_SECONDS, 10)
        self.assertIn("KillMode=control-group", UNIT)
        self.assertIn("TimeoutStopSec=15s", UNIT)
        flag = "--closure-gate-file %h/gem-workspace/state/gem-priority-gate/latest.json"
        self.assertIn(flag, UNIT)
        with tempfile.TemporaryDirectory() as tmp:
            variant = pathlib.Path(tmp) / "symphony-elixir.service"
            variant.write_text(UNIT.replace(f"{flag} ", ""), encoding="utf-8")
            result = helper.validate_source(
                repo_root=ROOT,
                workflow_path=WORKFLOW_PATH,
                unit_path=variant,
                service_name="symphony-elixir.service",
                active_issues=helper.MEASURED_ACTIVE_ISSUES,
            )
            self.assertFalse(result["ok"])
            self.assertIn("unit_missing_closure_stop_line_gate", result["errors"])

    def test_closure_stop_line_red_receipt_holds_new_admission(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            closure_gate.write_text(
                json.dumps(_fleet_gate_payload(status="red", intake=False)),
                encoding="utf-8",
            )
            hold = pathlib.Path(tmp) / "closure-hold.json"
            verdict = helper.read_closure_stop_line(closure_gate)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "closure-health-not-green")
            self.assertEqual(verdict["closureStatus"], "red")
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                    "--closure-gate-file",
                    str(closure_gate),
                    "--closure-hold-receipt",
                    str(hold),
                    "--dead-letter-dir",
                    str(pathlib.Path(tmp) / "dead-letters"),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    "print('must-not-run')",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, helper.CLOSURE_HOLD_EXIT_CODE)
            self.assertNotIn("must-not-run", result.stdout)
            receipt = json.loads(hold.read_text(encoding="utf-8"))
            self.assertEqual(receipt["schema"], helper.CLOSURE_HOLD_SCHEMA)
            self.assertEqual(receipt["status"], "exhausted")
            self.assertEqual(receipt["reason"], "closure-health-not-green")
            self.assertEqual(receipt["closureStatus"], "red")
            self.assertEqual(receipt["receiptPath"], str(closure_gate))
            self.assertFalse(receipt["newIssueIntakeAllowed"])

    def test_closure_stop_line_green_receipt_admits(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    "print('closure-green-child-ran')",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("closure-green-child-ran", result.stdout)
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            verdict = helper.read_closure_stop_line(closure_gate)
            self.assertFalse(verdict["hold"])
            self.assertEqual(verdict["reason"], "closure-health-green")

    def test_bounded_repair_admits_one_exact_job_while_canonical_closure_is_red(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ,
            {
                "CODEX_HOME": "/tmp/codex-fourth",
                "GITHUB_TOKEN": "must-not-reach-agent",
                "GH_TOKEN": "must-not-reach-agent",
                "LINEAR_API_KEY": "must-not-reach-agent",
                "AWS_SECRET_ACCESS_KEY": "must-not-reach-agent",
                "UNRELATED_RECOVERY_SECRET": "must-not-reach-agent",
            },
        ):
            gate, _fleet, manifest_path, manifest, command = _bounded_repair_fixture(
                tmp, helper
            )
            canonical_bytes = gate.read_bytes()
            ordinary = helper.read_closure_stop_line(gate)
            self.assertTrue(ordinary["hold"])
            self.assertEqual(ordinary["reason"], "closure-health-not-green")
            bounded = helper.read_closure_stop_line(
                gate, recovery_manifest_path=manifest_path
            )
            self.assertFalse(bounded["hold"])
            self.assertEqual(bounded["reason"], "bounded-local-repair")
            self.assertEqual(bounded["issueIdentifier"], "JOV-9999")

            args = [
                "python3", str(HELPER_PATH), "run",
                "--gate-file", str(pathlib.Path(tmp) / "rate.json"),
                "--closure-gate-file", str(gate),
                "--closure-hold-receipt", str(pathlib.Path(tmp) / "hold.json"),
                "--dead-letter-dir", str(pathlib.Path(tmp) / "dead"),
                "--recovery-manifest", str(manifest_path),
                "--max-gate-sleep-seconds", "0", "--", *command,
            ]
            first = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            self.assertIn("bounded-repair-ran", first.stdout)
            claim = json.loads((pathlib.Path(tmp) / "repair.claim.json").read_text())
            self.assertEqual(claim["issueIdentifier"], "JOV-9999")
            self.assertEqual(
                claim["issueId"], "12345678-1234-1234-1234-123456789abc"
            )
            self.assertEqual(
                claim["workspace"],
                str(
                    manifest_path.parent
                    / f"workspace-JOV-9999-{manifest['sourceCommit'][:12]}"
                    / "JOV-9999"
                ),
            )
            self.assertEqual(gate.read_bytes(), canonical_bytes)

            second = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(second.returncode, helper.CLOSURE_HOLD_EXIT_CODE)
            self.assertNotIn("bounded-repair-ran", second.stdout)
            self.assertIn("recovery-manifest-already-claimed", second.stdout)

    def test_bounded_repair_fixture_shells_fail_secret_negative_control(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            _gate, _fleet, _manifest_path, manifest, command = (
                _bounded_repair_fixture(tmp, helper)
            )
            env = os.environ.copy()
            for name in (
                "GITHUB_TOKEN",
                "GH_TOKEN",
                "LINEAR_API_KEY",
                "AWS_SECRET_ACCESS_KEY",
                "UNRELATED_RECOVERY_SECRET",
            ):
                env.pop(name, None)
            env["GITHUB_TOKEN"] = "negative-control-must-fail"

            binary = subprocess.run(
                command, cwd=ROOT, env=env, capture_output=True, text=True
            )
            self.assertNotEqual(binary.returncode, 0, binary.stdout + binary.stderr)
            self.assertNotIn("bounded-repair-ran", binary.stdout)

            router = subprocess.run(
                [manifest["artifacts"]["router"]["path"], "app-server"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(router.returncode, 0, router.stdout + router.stderr)
            self.assertNotIn("bounded-repair-ran", router.stdout)

    def test_bounded_repair_claim_is_exclusive_under_concurrent_agent_start(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
        ):
            _gate, _fleet, manifest_path, manifest, _command = (
                _bounded_repair_fixture(tmp, helper)
            )
            codex_cli = pathlib.Path(manifest["artifacts"]["codexCli"]["path"])
            codex_cli.write_text(
                "#!/bin/sh\nsleep 0.2\necho bounded-repair-ran\n",
                encoding="utf-8",
            )
            codex_cli.chmod(0o700)
            manifest["artifacts"]["codexCli"]["sha256"] = hashlib.sha256(
                codex_cli.read_bytes()
            ).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            manifest_path.chmod(0o600)
            agent_command = [
                "python3",
                str(HELPER_PATH),
                "recovery-agent",
                "--manifest",
                str(manifest_path),
                "--issue-identifier",
                "JOV-9999",
                "--issue-id",
                "12345678-1234-1234-1234-123456789abc",
                "--workspace",
                str(pathlib.Path(manifest["workspaceRoot"]) / "JOV-9999"),
                "--",
                str(pathlib.Path(manifest["artifacts"]["router"]["path"])),
                "app-server",
            ]
            workspace = pathlib.Path(manifest["workspaceRoot"]) / "JOV-9999"
            workspace.mkdir()
            processes = [
                subprocess.Popen(
                    agent_command,
                    cwd=workspace,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                for _ in range(2)
            ]
            results = [process.communicate(timeout=10) for process in processes]
            self.assertEqual(
                sorted(process.returncode for process in processes),
                [0, helper.CLOSURE_HOLD_EXIT_CODE],
            )
            self.assertEqual(
                sum("bounded-repair-ran" in stdout for stdout, _stderr in results),
                1,
            )
            self.assertEqual(
                sum("recovery-manifest-already-claimed" in stdout
                    for stdout, _stderr in results),
                1,
            )

    def test_bounded_repair_agent_binds_issue_uuid_identifier_and_workspace(self):
        helper = _load_helper()
        variants = {
            "different-issue": ("JOV-9998", "12345678-1234-1234-1234-123456789abc", None, "recovery-agent-issue-identifier-mismatch"),
            "different-uuid": ("JOV-9999", "aaaaaaaa-1234-1234-1234-123456789abc", None, "recovery-agent-issue-id-mismatch"),
            "different-workspace-argument": ("JOV-9999", "12345678-1234-1234-1234-123456789abc", "JOV-9998", "recovery-agent-workspace-argument-mismatch"),
            "different-cwd": ("JOV-9999", "12345678-1234-1234-1234-123456789abc", None, "recovery-agent-workspace-mismatch"),
        }
        for name, (identifier, issue_id, workspace_name, reason) in variants.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
                os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
            ):
                _gate, _fleet, manifest_path, manifest, _command = (
                    _bounded_repair_fixture(tmp, helper)
                )
                root = pathlib.Path(manifest["workspaceRoot"])
                expected_workspace = root / "JOV-9999"
                supplied_workspace = root / (workspace_name or "JOV-9999")
                supplied_workspace.mkdir(exist_ok=True)
                cwd = root / "JOV-9998" if name == "different-cwd" else expected_workspace
                cwd.mkdir(exist_ok=True)
                router = pathlib.Path(manifest["artifacts"]["router"]["path"])
                result = subprocess.run(
                    [
                        sys.executable,
                        str(HELPER_PATH),
                        "recovery-agent",
                        "--manifest",
                        str(manifest_path),
                        "--issue-identifier",
                        identifier,
                        "--issue-id",
                        issue_id,
                        "--workspace",
                        str(supplied_workspace),
                        "--",
                        str(router),
                        "app-server",
                    ],
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, helper.CLOSURE_HOLD_EXIT_CODE)
                self.assertIn(reason, result.stdout)
                self.assertFalse(pathlib.Path(manifest["claimPath"]).exists())

    def test_bounded_repair_refusal_matrix_fails_closed(self):
        helper = _load_helper()
        mutations = {
            "wrong-issue": lambda manifest, fleet: manifest.update(issueIdentifier="JOV-9998"),
            "wrong-label": lambda manifest, fleet: manifest.update(requiredLabel="repair"),
            "max-two": lambda manifest, fleet: manifest.update(maxConcurrent=2),
            "new-intake": lambda manifest, fleet: manifest.update(newIssueIntakeAllowed=True),
            "push": lambda manifest, fleet: manifest.update(pushAllowed=True),
            "wrong-source": lambda manifest, fleet: manifest.update(sourceCommit="0" * 40),
            "wrong-account": lambda manifest, fleet: manifest.update(accountHome="/tmp/other"),
            "bad-account-hash": lambda manifest, fleet: manifest["artifacts"]["accountEnv"].update(sha256="0" * 64),
            "wrong-activity": lambda manifest, fleet: manifest.update(activity="focused-tests"),
            "wrong-model": lambda manifest, fleet: manifest.update(model="gpt-5.6-luna"),
            "wrong-model-limit": lambda manifest, fleet: manifest.update(modelRateLimitId="codex"),
            "fallback-enabled": lambda manifest, fleet: manifest.update(modelFallbackAllowed=True),
            "wrong-expiry-kind": lambda manifest, fleet: manifest["externalExpiry"].update(kind="internal-timer"),
            "wrong-expiry-unit": lambda manifest, fleet: manifest["externalExpiry"].update(unit="shared.service"),
            "wrong-expiry-limit": lambda manifest, fleet: manifest["externalExpiry"].update(runtimeMaxSeconds=901),
            "wrong-expiry-kill-mode": lambda manifest, fleet: manifest["externalExpiry"].update(killMode="process"),
            "expiry-without-sigkill": lambda manifest, fleet: manifest["externalExpiry"].update(sendSIGKILL=False),
            "wrong-workspace": lambda manifest, fleet: manifest.update(workspaceRoot="/tmp/other"),
            "wrong-command": lambda manifest, fleet: manifest.update(schedulerCommand=["false"]),
            "bad-hash": lambda manifest, fleet: manifest["artifacts"]["workflow"].update(sha256="0" * 64),
            "bad-codex-hash": lambda manifest, fleet: manifest["artifacts"]["codexCli"].update(sha256="0" * 64),
            "local-revoked": lambda manifest, fleet: fleet["remediationAdmission"].update(localAllowed=False),
            "activity-revoked": lambda manifest, fleet: fleet["remediationAdmission"].update(activities=[]),
            "floor-zero": lambda manifest, fleet: fleet["concurrency"]["gem"].update(runtimeFloor=0),
            "floor-two": lambda manifest, fleet: fleet["concurrency"]["gem"].update(runtimeFloor=2),
            "stale-gate": lambda manifest, fleet: fleet.update(observedAt="2020-01-01T00:00:00Z"),
            "future-gate": lambda manifest, fleet: fleet.update(observedAt="2099-01-01T00:00:00Z"),
            "expired": lambda manifest, fleet: manifest.update(expiresAt="2020-01-01T00:00:00+00:00"),
            "manifest-mode": lambda manifest, fleet: manifest.update(),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
                os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
            ):
                gate, fleet, manifest_path, manifest, command = _bounded_repair_fixture(
                    tmp, helper
                )
                mutate(manifest, fleet)
                gate.write_text(json.dumps(fleet), encoding="utf-8")
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                manifest_path.chmod(0o644 if name == "manifest-mode" else 0o600)
                if name == "wrong-command":
                    with self.assertRaisesRegex(ValueError, "command-mismatch"):
                        helper.validate_bounded_repair_admission(
                            manifest_path,
                            fleet_path=gate,
                            fleet_payload=fleet,
                            expected_command=command,
                        )
                    continue
                verdict = helper.read_closure_stop_line(
                    gate, recovery_manifest_path=manifest_path
                )
                self.assertTrue(verdict["hold"], name)
                if name in {"stale-gate", "future-gate"}:
                    self.assertEqual(
                        verdict["reason"],
                        "fleet-gate-receipt-stale" if name == "stale-gate" else "fleet-gate-receipt-future",
                    )
                else:
                    self.assertTrue(verdict["reason"].startswith("bounded-repair-refused:"))

    def test_bounded_repair_workflow_sections_cannot_be_spoofed_by_decoys(self):
        helper = _load_helper()
        variants = {
            "max-turns": (
                "max_turns: 1",
                "max_turns: 99\nreview_metadata:\n  max_turns: 1",
                "max-turns-not-one",
            ),
            "duplicate-max-turns": (
                "max_turns: 1",
                "max_turns: 1\n  max_turns: 1",
                "duplicate scalar max_turns",
            ),
            "network": (
                "networkAccess: false",
                "networkAccess: true\nreview_metadata:\n  networkAccess: false",
                "network-not-false",
            ),
            "sandbox": (
                "thread_sandbox: read-only",
                "thread_sandbox: workspace-write",
                "thread-sandbox-not-read-only",
            ),
        }
        for name, (old, new, reason) in variants.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
                os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
            ):
                gate, fleet, manifest_path, manifest, _command = _bounded_repair_fixture(
                    tmp, helper
                )
                workflow = pathlib.Path(manifest["artifacts"]["workflow"]["path"])
                workflow.write_text(
                    workflow.read_text(encoding="utf-8").replace(old, new),
                    encoding="utf-8",
                )
                manifest["artifacts"]["workflow"]["sha256"] = hashlib.sha256(
                    workflow.read_bytes()
                ).hexdigest()
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                manifest_path.chmod(0o600)
                with self.assertRaisesRegex(ValueError, reason):
                    helper.validate_bounded_repair_admission(
                        manifest_path,
                        fleet_path=gate,
                        fleet_payload=fleet,
                    )

    def test_bounded_repair_workflow_root_must_match_manifest_and_launch_binding(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
        ):
            gate, fleet, manifest_path, manifest, _command = _bounded_repair_fixture(
                tmp, helper
            )
            workflow = pathlib.Path(manifest["artifacts"]["workflow"]["path"])
            workflow.write_text(
                workflow.read_text(encoding="utf-8").replace(
                    f"root: {manifest['workspaceRoot']}",
                    f"root: {pathlib.Path(tmp) / 'unrelated-workspaces'}",
                ),
                encoding="utf-8",
            )
            manifest["artifacts"]["workflow"]["sha256"] = hashlib.sha256(
                workflow.read_bytes()
            ).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            manifest_path.chmod(0o600)
            with self.assertRaisesRegex(
                ValueError, "recovery-workflow-workspace-root-mismatch"
            ):
                helper.validate_bounded_repair_admission(
                    manifest_path,
                    fleet_path=gate,
                    fleet_payload=fleet,
                )

    def test_bounded_repair_router_is_exact_spark_without_fallback(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
        ):
            gate, fleet, manifest_path, manifest, _command = _bounded_repair_fixture(
                tmp, helper
            )
            router = pathlib.Path(manifest["artifacts"]["router"]["path"])
            router.write_text(
                router.read_text(encoding="utf-8").replace(
                    helper.BOUNDED_REPAIR_MODEL, "gpt-5.6-luna"
                ),
                encoding="utf-8",
            )
            manifest["artifacts"]["router"]["sha256"] = hashlib.sha256(
                router.read_bytes()
            ).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            manifest_path.chmod(0o600)
            with self.assertRaisesRegex(
                ValueError, "recovery-router-not-exact-spark-no-fallback"
            ):
                helper.validate_bounded_repair_admission(
                    manifest_path,
                    fleet_path=gate,
                    fleet_payload=fleet,
                )

    def test_bounded_repair_rejects_shared_or_nonempty_root_before_scheduler(self):
        helper = _load_helper()
        for variant, expected_reason in {
            "nonempty": "recovery-workspace-root-not-empty",
            "shared": "recovery-workspace-root-not-packet-local",
        }.items():
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
                os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
            ):
                gate, _fleet, manifest_path, manifest, command = _bounded_repair_fixture(
                    tmp, helper
                )
                original_root = pathlib.Path(manifest["workspaceRoot"])
                if variant == "nonempty":
                    (original_root / "unrelated-workspace").mkdir()
                    expected_workspace = original_root / "JOV-9999"
                else:
                    shared_root = pathlib.Path(tmp) / "symphony-elixir-workspaces"
                    shared_root.mkdir()
                    expected_workspace = shared_root / "JOV-9999"
                    workflow = pathlib.Path(manifest["artifacts"]["workflow"]["path"])
                    workflow.write_text(
                        workflow.read_text(encoding="utf-8").replace(
                            str(original_root), str(shared_root)
                        ),
                        encoding="utf-8",
                    )
                    binary = pathlib.Path(manifest["artifacts"]["binary"]["path"])
                    binary.write_text(
                        binary.read_text(encoding="utf-8").replace(
                            str(original_root), str(shared_root)
                        ),
                        encoding="utf-8",
                    )
                    binary.chmod(0o700)
                    manifest["workspaceRoot"] = str(shared_root)
                    for name in ("workflow", "binary"):
                        path = pathlib.Path(manifest["artifacts"][name]["path"])
                        manifest["artifacts"][name]["sha256"] = hashlib.sha256(
                            path.read_bytes()
                        ).hexdigest()
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                manifest_path.chmod(0o600)
                result = subprocess.run(
                    [
                        sys.executable,
                        str(HELPER_PATH),
                        "run",
                        "--gate-file",
                        str(pathlib.Path(tmp) / "rate.json"),
                        "--closure-gate-file",
                        str(gate),
                        "--closure-hold-receipt",
                        str(pathlib.Path(tmp) / "hold.json"),
                        "--dead-letter-dir",
                        str(pathlib.Path(tmp) / "dead"),
                        "--recovery-manifest",
                        str(manifest_path),
                        "--max-gate-sleep-seconds",
                        "0",
                        "--",
                        *command,
                    ],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, helper.CLOSURE_HOLD_EXIT_CODE)
                self.assertIn(expected_reason, result.stdout)
                self.assertFalse(expected_workspace.exists())
                self.assertFalse(pathlib.Path(manifest["claimPath"]).exists())

    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux subreaper proof")
    def test_bounded_repair_expiry_terminates_root_and_detached_descendant(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
        ):
            gate, _fleet, manifest_path, _manifest, _command = _bounded_repair_fixture(
                tmp, helper, lifetime_seconds=1
            )
            child_pid_path = pathlib.Path(tmp) / "child.pid"
            script = (
                "import os,pathlib,time; "
                "pid=os.fork(); "
                f"path=pathlib.Path({str(child_pid_path)!r}); "
                "(os.setsid(),path.write_text(str(os.getpid())),time.sleep(60)) if pid==0 "
                "else (print('root-ready',flush=True),time.sleep(60))"
            )
            closure = helper.ClosureStopLine(
                receipt_path=gate,
                hold_receipt_path=pathlib.Path(tmp) / "hold.json",
                dead_letter_dir=pathlib.Path(tmp) / "dead",
                recovery_manifest_path=manifest_path,
            )
            old_recheck = helper.CLOSURE_HOLD_RECHECK_SECONDS
            helper.CLOSURE_HOLD_RECHECK_SECONDS = 0.05
            try:
                started = time.monotonic()
                with contextlib.redirect_stdout(io.StringIO()):
                    helper.run_official_binary_once(
                        [sys.executable, "-c", script],
                        gate_file=pathlib.Path(tmp) / "rate.json",
                        closure=closure,
                        max_gate_sleep_seconds=0,
                    )
                self.assertLess(time.monotonic() - started, 8)
            finally:
                helper.CLOSURE_HOLD_RECHECK_SECONDS = old_recheck
            child_pid = int(child_pid_path.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)

    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux subreaper proof")
    def test_bounded_repair_gate_revocation_terminates_root_and_detached_descendant(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(
            os.environ, {"CODEX_HOME": "/tmp/codex-fourth"}
        ):
            gate, fleet, manifest_path, _manifest, _command = (
                _bounded_repair_fixture(tmp, helper)
            )
            child_pid_path = pathlib.Path(tmp) / "child.pid"
            script = (
                "import os,pathlib,time; "
                "pid=os.fork(); "
                f"path=pathlib.Path({str(child_pid_path)!r}); "
                "(os.setsid(),path.write_text(str(os.getpid())),time.sleep(60)) if pid==0 "
                "else (print('root-ready',flush=True),time.sleep(60))"
            )
            closure = helper.ClosureStopLine(
                receipt_path=gate,
                hold_receipt_path=pathlib.Path(tmp) / "hold.json",
                dead_letter_dir=pathlib.Path(tmp) / "dead",
                recovery_manifest_path=manifest_path,
            )

            def revoke_gate():
                deadline = time.monotonic() + 5
                while not child_pid_path.exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(child_pid_path.exists())
                fleet["remediationAdmission"]["localAllowed"] = False
                temporary = gate.with_suffix(".next")
                temporary.write_text(json.dumps(fleet), encoding="utf-8")
                os.replace(temporary, gate)

            mutator = threading.Thread(target=revoke_gate)
            old_recheck = helper.CLOSURE_HOLD_RECHECK_SECONDS
            helper.CLOSURE_HOLD_RECHECK_SECONDS = 0.05
            output = io.StringIO()
            try:
                mutator.start()
                with contextlib.redirect_stdout(output):
                    helper.run_official_binary_once(
                        [sys.executable, "-c", script],
                        gate_file=pathlib.Path(tmp) / "rate.json",
                        closure=closure,
                        max_gate_sleep_seconds=0,
                    )
                mutator.join(timeout=5)
                self.assertFalse(mutator.is_alive())
            finally:
                helper.CLOSURE_HOLD_RECHECK_SECONDS = old_recheck
            self.assertIn("bounded_repair_revoked", output.getvalue())
            child_pid = int(child_pid_path.read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)

    def test_closure_stop_line_missing_stale_future_or_tampered_fails_closed(self):
        helper = _load_helper()
        now = dt.datetime(2026, 9, 3, 12, 0, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            missing = pathlib.Path(tmp) / "absent.json"
            verdict = helper.read_closure_stop_line(missing, now=now)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "fleet-gate-receipt-missing")

            gate = pathlib.Path(tmp) / "fleet-gate.json"
            gate.write_text("not json", encoding="utf-8")
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertTrue(verdict["hold"])
            self.assertEqual(
                verdict["reason"], "fleet-gate-receipt-invalid:JSONDecodeError"
            )

            gate.write_text("[]", encoding="utf-8")
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertEqual(verdict["reason"], "fleet-gate-receipt-schema-mismatch")

            # Stale: observed 11 minutes before now with the 600s window.
            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at="2026-09-03T11:49:00Z")),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "fleet-gate-receipt-stale")
            self.assertEqual(verdict["receiptAgeSeconds"], 660)

            # Fresh within the window admits.
            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at="2026-09-03T11:51:00Z")),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertFalse(verdict["hold"])

            # Future-dated beyond the skew bound fails closed.
            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at="2026-09-03T12:05:00Z")),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "fleet-gate-receipt-future")

            fresh = "2026-09-03T11:59:00Z"

            def write_tampered(mutate):
                payload = _fleet_gate_payload(observed_at=fresh)
                mutate(payload)
                gate.write_text(json.dumps(payload), encoding="utf-8")
                return helper.read_closure_stop_line(gate, now=now)

            verdict = write_tampered(
                lambda payload: payload["signals"]["closureHealth"].update(
                    authority="Gem"
                )
            )
            self.assertEqual(verdict["reason"], "closure-health-receipt-tampered")
            verdict = write_tampered(
                lambda payload: payload["signals"]["closureHealth"].update(
                    newIssueIntakeAllowed=False
                )
            )
            self.assertEqual(verdict["reason"], "closure-health-receipt-tampered")
            verdict = write_tampered(
                lambda payload: payload["signals"]["closureHealth"].update(
                    status="red", newIssueIntakeAllowed=True
                )
            )
            self.assertEqual(verdict["reason"], "closure-health-receipt-tampered")
            verdict = write_tampered(
                lambda payload: payload["signals"]["closureHealth"].update(
                    promotionContinues=False
                )
            )
            self.assertEqual(verdict["reason"], "closure-health-receipt-tampered")
            verdict = write_tampered(
                lambda payload: payload["closureAdmission"].update(status="red")
            )
            self.assertEqual(verdict["reason"], "closure-admission-disagrees")
            verdict = write_tampered(lambda payload: payload.pop("signals"))
            self.assertEqual(verdict["reason"], "closure-health-missing")

            # Grace is internally consistent but is not the green admission state.
            gate.write_text(
                json.dumps(
                    _fleet_gate_payload(
                        status="grace", intake=False, observed_at=fresh
                    )
                ),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "closure-health-not-green")
            self.assertEqual(verdict["closureStatus"], "grace")

    def test_closure_hold_releases_when_receipt_turns_green(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            hold = pathlib.Path(tmp) / "closure-hold.json"
            closure_gate.write_text(
                json.dumps(_fleet_gate_payload(status="red", intake=False)),
                encoding="utf-8",
            )
            closure = helper.ClosureStopLine(
                receipt_path=closure_gate,
                hold_receipt_path=hold,
                dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
            )
            sleeps = []

            def fake_sleep(seconds):
                sleeps.append(seconds)
                closure_gate.write_text(
                    json.dumps(_fleet_gate_payload()), encoding="utf-8"
                )

            out = io.StringIO()
            with mock.patch.object(helper.time, "sleep", side_effect=fake_sleep):
                with contextlib.redirect_stdout(out):
                    returncode = helper.run_official_binary(
                        ["python3", "-c", "print('closure-released-child-ran')"],
                        gate_file=pathlib.Path(tmp) / "linear-rate-limit.json",
                        closure=closure,
                        max_gate_sleep_seconds=300,
                    )
            self.assertEqual(returncode, 0)
            self.assertIn("closure-released-child-ran", out.getvalue())
            self.assertIn("closure_hold_wait", out.getvalue())
            self.assertIn("closure_hold_release", out.getvalue())
            self.assertEqual(sleeps, [helper.CLOSURE_HOLD_RECHECK_SECONDS])
            receipt = json.loads(hold.read_text(encoding="utf-8"))
            self.assertEqual(receipt["schema"], helper.CLOSURE_HOLD_SCHEMA)
            self.assertEqual(receipt["status"], "released")
            self.assertEqual(
                receipt["holdSleepSecondsUsed"], helper.CLOSURE_HOLD_RECHECK_SECONDS
            )
            self.assertEqual(receipt["reason"], "closure-health-green")

    def test_closure_hold_pauses_live_scheduler_without_terminating_child(self):
        helper = _load_helper()
        process = subprocess.Popen(
            ["python3", "-c", "import time; time.sleep(30)"],
            cwd=ROOT,
            text=True,
        )
        kills = []
        try:
            with tempfile.TemporaryDirectory() as tmp:
                closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
                hold = pathlib.Path(tmp) / "closure-hold.json"
                closure_gate.write_text(
                    json.dumps(_fleet_gate_payload(status="red", intake=False)),
                    encoding="utf-8",
                )
                closure = helper.ClosureStopLine(
                    receipt_path=closure_gate,
                    hold_receipt_path=hold,
                    dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
                )
                verdict = helper.read_closure_stop_line(closure_gate)
                self.assertTrue(verdict["hold"])

                def fake_sleep(_seconds):
                    closure_gate.write_text(
                        json.dumps(_fleet_gate_payload()), encoding="utf-8"
                    )

                out = io.StringIO()
                with mock.patch.object(
                    helper.os,
                    "kill",
                    side_effect=lambda pid, sig: kills.append((pid, sig)),
                ):
                    with mock.patch.object(
                        helper.time, "sleep", side_effect=fake_sleep
                    ):
                        with contextlib.redirect_stdout(out):
                            slept = helper._pause_child_for_closure_hold(
                                process, closure, verdict, 300
                            )
                self.assertEqual(slept, helper.CLOSURE_HOLD_RECHECK_SECONDS)
                self.assertEqual(
                    kills,
                    [
                        (process.pid, helper.signal.SIGSTOP),
                        (process.pid, helper.signal.SIGCONT),
                    ],
                )
                self.assertEqual(json.loads(hold.read_text())["status"], "released")
                self.assertIn("closure_hold_wait", out.getvalue())
                self.assertIn("closure_hold_release", out.getvalue())
        finally:
            process.terminate()
            process.wait(timeout=5)

    def test_closure_hold_exhaustion_resumes_scheduler_for_collection(self):
        helper = _load_helper()
        process = subprocess.Popen(
            ["python3", "-c", "import time; time.sleep(30)"],
            cwd=ROOT,
            text=True,
        )
        kills = []
        try:
            with tempfile.TemporaryDirectory() as tmp:
                closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
                hold = pathlib.Path(tmp) / "closure-hold.json"
                closure_gate.write_text(
                    json.dumps(_fleet_gate_payload(status="red", intake=False)),
                    encoding="utf-8",
                )
                closure = helper.ClosureStopLine(
                    receipt_path=closure_gate,
                    hold_receipt_path=hold,
                    dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
                )
                verdict = helper.read_closure_stop_line(closure_gate)
                self.assertTrue(verdict["hold"])
                out = io.StringIO()
                with mock.patch.object(
                    helper.os,
                    "kill",
                    side_effect=lambda pid, sig: kills.append((pid, sig)),
                ):
                    with mock.patch.object(helper.time, "sleep", lambda _seconds: None):
                        with contextlib.redirect_stdout(out):
                            slept = helper._pause_child_for_closure_hold(
                                process,
                                closure,
                                verdict,
                                helper.CLOSURE_HOLD_RECHECK_SECONDS,
                            )
                self.assertEqual(slept, helper.CLOSURE_HOLD_RECHECK_SECONDS)
                self.assertEqual(
                    kills,
                    [
                        (process.pid, helper.signal.SIGSTOP),
                        (process.pid, helper.signal.SIGCONT),
                    ],
                )
                receipt = json.loads(hold.read_text())
                self.assertEqual(receipt["status"], "exhausted")
                self.assertEqual(receipt["reason"], "closure-health-not-green")
                self.assertIn("closure_hold_wait_exhausted", out.getvalue())
        finally:
            process.terminate()
            process.wait(timeout=5)

    def test_linear_permanent_error_dead_letters_after_bounded_ceiling(self):
        helper = _load_helper()
        lines = "".join(
            f"linear_api_status=400 issue_identifier=JOV-4195 attempt={attempt}\n"
            for attempt in (1, 2, 3, 4)
        )
        script = f"import sys\nsys.stdout.write({lines!r})\nsys.stdout.flush()\n"
        with tempfile.TemporaryDirectory() as tmp:
            dead = pathlib.Path(tmp) / "dead-letters"
            command = [
                "python3",
                str(HELPER_PATH),
                "run",
                "--gate-file",
                str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                *_closure_run_args(tmp),
                "--max-gate-sleep-seconds",
                "0",
                "--",
                "python3",
                "-c",
                script,
            ]
            result = subprocess.run(
                command, cwd=ROOT, capture_output=True, text=True
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("issue_dead_letter", result.stdout)
            receipt_path = dead / "JOV-4195.json"
            self.assertTrue(receipt_path.is_file())
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            self.assertEqual(receipt["schema"], helper.ISSUE_DEAD_LETTER_SCHEMA)
            self.assertEqual(receipt["status"], "dead-lettered")
            self.assertEqual(receipt["issue"], "JOV-4195")
            self.assertEqual(receipt["errorClass"], "linear_permanent_client_error")
            self.assertEqual(receipt["linearApiStatus"], 400)
            self.assertEqual(
                receipt["attempts"], helper.LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS
            )
            self.assertEqual(
                receipt["maxAttempts"], helper.LINEAR_PERMANENT_ERROR_MAX_ATTEMPTS
            )
            self.assertTrue(receipt["excludedFromDispatch"])
            self.assertTrue(receipt["firstObservedAt"])
            before = receipt_path.read_text(encoding="utf-8")

            # Exclude-from-dispatch: a later storm for the same issue is
            # suppressed against the durable receipt, not re-receipted.
            again = subprocess.run(
                command, cwd=ROOT, capture_output=True, text=True
            )
            self.assertEqual(again.returncode, 0, again.stderr + again.stdout)
            self.assertIn("issue_dead_letter_suppressed", again.stdout)
            self.assertEqual(receipt_path.read_text(encoding="utf-8"), before)

    def test_linear_permanent_error_classifier_boundaries(self):
        helper = _load_helper()
        now = dt.datetime(2026, 9, 3, 12, 0, 0, tzinfo=dt.timezone.utc)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            with tempfile.TemporaryDirectory() as tmp:
                tracked: dict = {}
                noted: set = set()
                for attempt in (1, 2):
                    error = helper.classify_linear_issue_error_log_line(
                        f"linear_api_status=400 issue_identifier=JOV-4195 attempt={attempt}",
                        now=now,
                    )
                    self.assertIsNotNone(error)
                    self.assertEqual(error["kind"], "linear_permanent_client_error")
                    self.assertEqual(error["issue"], "JOV-4195")
                    self.assertEqual(error["status"], 400)
                    self.assertEqual(error["attempt"], attempt)
                    self.assertIsNone(
                        helper.record_linear_issue_error(
                            pathlib.Path(tmp), error, tracked, noted, now=now
                        )
                    )
                self.assertFalse((pathlib.Path(tmp) / "JOV-4195.json").exists())

            # A logged attempt at/over the ceiling dead-letters immediately.
            with tempfile.TemporaryDirectory() as tmp:
                error = helper.classify_linear_issue_error_log_line(
                    "linear_api_status=400 issue_identifier=JOV-4195 attempt=49",
                    now=now,
                )
                receipt = helper.record_linear_issue_error(
                    pathlib.Path(tmp), error, {}, set(), now=now
                )
                self.assertIsNotNone(receipt)
                self.assertEqual(receipt["attempts"], 49)

        # 429 stays with the rate-limit path and never dead-letters.
        self.assertIsNone(
            helper.classify_linear_issue_error_log_line(
                "linear_api_status=429 issue_identifier=JOV-4195 attempt=53", now=now
            )
        )
        # A RATELIMITED 400 body is owned by the rate-limit gate.
        line = (
            "linear_api_status=400 issue_identifier=JOV-4195 attempt=49 "
            '{"errors":[{"extensions":{"code":"RATELIMITED"}}]}'
        )
        self.assertIsNone(helper.classify_linear_issue_error_log_line(line, now=now))
        self.assertIsNotNone(helper.classify_linear_log_line(line, now=now))
        # The space-separated live loopback shape classifies too.
        error = helper.classify_linear_issue_error_log_line(
            "linear_api_status 400 JOV-4195", now=now
        )
        self.assertIsNotNone(error)
        self.assertEqual(error["issue"], "JOV-4195")
        self.assertIsNone(error["attempt"])
        # Ambiguous or missing attribution fails closed to no action.
        self.assertIsNone(
            helper.classify_linear_issue_error_log_line(
                "linear_api_status=400 JOV-1 JOV-2", now=now
            )
        )
        self.assertIsNone(
            helper.classify_linear_issue_error_log_line("linear_api_status=400", now=now)
        )
        # 5xx is transient, never permanent.
        self.assertIsNone(
            helper.classify_linear_issue_error_log_line(
                "linear_api_status=502 issue_identifier=JOV-4195", now=now
            )
        )
        # Ordinary Linear traffic is not an error signal.
        self.assertIsNone(
            helper.classify_linear_issue_error_log_line(
                "linear_api_status=200 issue_identifier=JOV-4195", now=now
            )
        )

    def test_linear_429_storm_never_dead_letters(self):
        helper = _load_helper()
        lines = "".join(
            f"linear_api_status=429 issue_identifier=JOV-4195 attempt={attempt}\n"
            for attempt in range(49, 54)
        )
        script = f"import sys\nsys.stdout.write({lines!r})\nsys.stdout.flush()\n"
        with tempfile.TemporaryDirectory() as tmp:
            dead = pathlib.Path(tmp) / "dead-letters"
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    script,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertFalse((dead / "JOV-4195.json").exists())
            self.assertNotIn("issue_dead_letter", result.stdout)

    def test_linear_ambiguous_error_storm_never_dead_letters(self):
        helper = _load_helper()
        lines = "".join(
            f"linear_api_status=400 issue_identifier=JOV-4195 related=JOV-4200 attempt={attempt}\n"
            for attempt in (1, 2, 3, 4, 5)
        )
        script = f"import sys\nsys.stdout.write({lines!r})\nsys.stdout.flush()\n"
        with tempfile.TemporaryDirectory() as tmp:
            dead = pathlib.Path(tmp) / "dead-letters"
            result = subprocess.run(
                [
                    "python3",
                    str(HELPER_PATH),
                    "run",
                    "--gate-file",
                    str(pathlib.Path(tmp) / "linear-rate-limit.json"),
                    *_closure_run_args(tmp),
                    "--max-gate-sleep-seconds",
                    "0",
                    "--",
                    "python3",
                    "-c",
                    script,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertFalse(dead.exists())
            self.assertNotIn("issue_dead_letter", result.stdout)

    def test_linear_eligible_count_override_is_dependency_free_and_validated(self):
        result = subprocess.run(
            ["python3", str(HELPER_PATH), "linear-eligible-count"],
            cwd=ROOT,
            env={**os.environ, "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110"},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "110")
        invalid = subprocess.run(
            ["python3", str(HELPER_PATH), "linear-eligible-count"],
            cwd=ROOT,
            env={**os.environ, "SYMPHONY_LINEAR_ACTIVE_ISSUES": "not-a-number"},
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(invalid.returncode, 0)
        self.assertIn("SYMPHONY_LINEAR_ACTIVE_ISSUES", invalid.stderr)

    def test_updater_dry_run_and_config_copy_refuse_obsolete_shape(self):
        self.assertIn("linux_x86_64", UPDATER)
        self.assertIn('SYMPHONY_VERSION="${SYMPHONY_VERSION:-v0.0.2-jovie.2}"', UPDATER)
        self.assertIn("sha256", UPDATER)
        self.assertIn("symphony-elixir.service", UPDATER)
        self.assertNotIn("enable symphony-burrito.service", UPDATER)
        self.assertIn("scripts/symphony/WORKFLOW.md", UPDATER)
        self.assertIn("SOURCE_INVALID", UPDATER)
        self.assertIn("PROMOTION_RED", UPDATER)
        self.assertIn("http://127.0.0.1:4041/api/v1/state", UPDATER)
        tty1 = (ROOT / "scripts/symphony/gem-checkin-tty1.sh").read_text()
        self.assertIn("List HUD owns tty1", tty1)
        self.assertIn("gem-checkin-hud.py", tty1)
        self.assertNotIn("until a pickup has a PR", tty1)
        updater = ROOT / "scripts/symphony/update-symphony-burrito.sh"
        budget_env = {**os.environ, "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110"}
        dry = subprocess.run(
            ["bash", str(updater), "--dry-run", "--no-restart"],
            cwd=ROOT,
            env=budget_env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertIn("SERVICE symphony-elixir.service", dry.stdout)
        self.assertIn("PORT 4041", dry.stdout)
        self.assertIn("BUDGET_OK steady=1100 budget=2500 headroom=1400 pages=3 polls=120", dry.stdout)
        self.assertIn("UNTOUCHED symphony-lyb.service http://127.0.0.1:4042/api/v1/state", dry.stdout)
        self.assertNotIn("4043", dry.stdout)
        obsolete = subprocess.run(
            ["bash", str(updater), "--dry-run", "--no-restart"],
            cwd=ROOT,
            env={**budget_env, "SYMPHONY_SERVICE_NAME": "symphony-burrito.service"},
            capture_output=True,
            text=True,
        )
        self.assertEqual(obsolete.returncode, 4)
        self.assertIn("obsolete_service_name:symphony-burrito.service", obsolete.stdout)
        with tempfile.TemporaryDirectory() as tmp:
            target_home = pathlib.Path(tmp) / "home"
            dest = pathlib.Path(tmp) / "home/.config/symphony"
            dest.mkdir(parents=True)
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            account_env = dest / "codex-account.env"
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            existing = dest / "WORKFLOW.md"
            existing.write_text("LIVE gem WORKFLOW — do not overwrite\n")
            wrong = pathlib.Path(tmp) / "wrong.md"
            wrong.write_text(WORKFLOW.replace("interval_ms: 30000", "interval_ms: 5000"))
            env = {
                **budget_env,
                "SYMPHONY_ELIXIR_HOME": str(target_home),
                "SYMPHONY_WORKFLOW_SRC": str(wrong),
            }
            red = subprocess.run(["bash", str(updater), "--skip-binary", "--no-restart"], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(red.returncode, 4)
            self.assertIn("poll_interval_too_low:5000", red.stdout)
            self.assertEqual(existing.read_text(), "LIVE gem WORKFLOW — do not overwrite\n")
            for unsafe_command in (
                "./scripts/hermes/symphony-codex-router app-server",
                "../../tmp/escaped-router app-server",
                "./scripts/symphony/missing-router app-server",
            ):
                wrong.write_text(WORKFLOW.replace(
                    "./scripts/symphony/symphony-codex-router app-server",
                    unsafe_command,
                ))
                rejected = subprocess.run(
                    ["bash", str(updater), "--skip-binary", "--no-restart"],
                    cwd=ROOT,
                    env=env,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(rejected.returncode, 4, unsafe_command)
                self.assertIn("workflow_agent_command_not_canonical", rejected.stdout)
                self.assertEqual(existing.read_text(), "LIVE gem WORKFLOW — do not overwrite\n")
            for unsafe_hook in (
                "sh /tmp/evil",
                "python3 /tmp/evil.py",
                "command /tmp/evil",
                "source /tmp/evil",
                "$(/tmp/evil)",
            ):
                wrong.write_text(WORKFLOW.replace(
                    "  after_create: |\n",
                    f"  after_create: |\n    {unsafe_hook}\n",
                ))
                rejected = subprocess.run(
                    ["bash", str(updater), "--skip-binary", "--no-restart"],
                    cwd=ROOT,
                    env=env,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(rejected.returncode, 4, unsafe_hook)
                self.assertEqual(existing.read_text(), "LIVE gem WORKFLOW — do not overwrite\n")
            env.pop("SYMPHONY_WORKFLOW_SRC")
            good = subprocess.run(["bash", str(updater), "--skip-binary", "--no-restart"], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(existing.read_text(), "LIVE gem WORKFLOW — do not overwrite\n")
            self.assertIn("DONE_STAGED_NO_LIVE_MUTATION", good.stdout)
            candidates = list((target_home / ".local/state/symphony-elixir/candidates").iterdir())
            self.assertEqual(len(candidates), 1)
            self.assertIn(f'team_key: "{LIVE_TEAM_KEY}"', (candidates[0] / "workflow").read_text())
            unit = pathlib.Path(tmp) / "home/.config/systemd/user/symphony-elixir.service"
            helper = pathlib.Path(tmp) / "home/.local/bin/symphony-official-runtime"
            unit.parent.mkdir(parents=True, exist_ok=True)
            helper.parent.mkdir(parents=True, exist_ok=True)
            existing.write_bytes(WORKFLOW_PATH.read_bytes())
            unit.write_bytes(UNIT_PATH.read_bytes())
            helper.write_bytes(HELPER_PATH.read_bytes())
            self.assertFalse((pathlib.Path(tmp) / "home/.config/systemd/user/symphony-burrito.service").exists())
            existing.write_text(
                existing.read_text().replace(
                    "max_concurrent_agents: 8", "max_concurrent_agents: 4"
                )
            )
            overlay = subprocess.run(
                ["bash", str(updater), "--check", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(overlay.returncode, 0, overlay.stdout + overlay.stderr)
            self.assertIn("bounded max_concurrent_agents overlay accepted", overlay.stdout)
            existing.write_text(
                existing.read_text().replace("interval_ms: 30000", "interval_ms: 31000")
            )
            drift = subprocess.run(
                ["bash", str(updater), "--check", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(drift.returncode, 1, drift.stdout + drift.stderr)
            self.assertIn(f"DRIFT {existing}", drift.stdout)

    def test_staging_is_not_live_and_activation_rollback_restores_prior_config(self):
        updater = ROOT / "scripts/symphony/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            target_home = root / "home"
            config = target_home / ".config/symphony"
            config.mkdir(parents=True)
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            (config / "codex-account.env").write_text(
                f"CODEX_HOME={account_home}\n"
            )
            (config / "codex-account.env").chmod(0o600)
            workflow = config / "WORKFLOW.md"
            helper = target_home / ".local/bin/symphony-official-runtime"
            unit = target_home / ".config/systemd/user/symphony-elixir.service"
            helper.parent.mkdir(parents=True)
            unit.parent.mkdir(parents=True)
            workflow.write_text("retired scripts/hermes/symphony-codex-router\n")
            helper.write_text("retired helper\n")
            unit.write_text("retired unit\n")

            fake_bin = root / "bin"
            fake_bin.mkdir()
            systemctl = fake_bin / "systemctl"
            systemctl.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' \"$*\" >> \"$SYSTEMCTL_EVENTS\"\n"
                "case \"$*\" in\n"
                "  *'show '*'LoadState --value'*) printf 'masked\\n'; exit 0;;\n"
                "  *'show symphony-elixir.service --property=MainPID --value'*) printf '4242\\n'; exit 0;;\n"
                "  *'is-active --quiet symphony-elixir.service'*) exit 0;;\n"
                "  *'is-active --quiet '*) exit 1;;\n"
                "  *'restart symphony-elixir.service'*) "
                "if [ -f \"$ALLOW_RESTART_ONCE\" ]; then rm -f \"$ALLOW_RESTART_ONCE\"; exit 0; fi; exit 42;;\n"
                "  *) exit 0;;\n"
                "esac\n"
            )
            systemctl.chmod(0o755)
            curl = fake_bin / "curl"
            curl.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' '{\"counts\":{\"running\":0},"
                "\"polling\":{\"checking\":false,\"next_poll_in_ms\":10000}}'\n"
            )
            curl.chmod(0o755)
            python = fake_bin / "python3"
            python.write_text(
                "#!/usr/bin/env bash\n"
                f"real={sys.executable!s}\n"
                "if [ \"${1:-}\" != - ]; then exec \"$real\" \"$@\"; fi\n"
                "payload=$(mktemp)\n"
                "trap 'rm -f \"$payload\" \"$payload.injected\"' EXIT\n"
                "cat > \"$payload\"\n"
                "if [ \"${FAIL_FINALIZE_AFTER_REMOVE:-0}\" = 1 ] && "
                "grep -q 'shutil.rmtree(tombstone)' \"$payload\"; then\n"
                "  sed 's/    shutil.rmtree(tombstone)/    shutil.rmtree(tombstone)\\n"
                "    raise OSError(\"injected post-delete fsync failure\")/' "
                "\"$payload\" > \"$payload.injected\"\n"
                "  exec \"$real\" \"$payload.injected\" \"${@:2}\"\n"
                "fi\n"
                "exec \"$real\" \"$payload\" \"${@:2}\"\n"
            )
            python.chmod(0o755)
            runtime = root / "runtime"
            runtime.mkdir()
            bus = socket.socket(socket.AF_UNIX)
            bus.bind(str(runtime / "bus"))
            self.addCleanup(bus.close)

            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    body = json.dumps({
                        "counts": {"running": 0},
                        "polling": {"checking": False, "next_poll_in_ms": 10000},
                    }).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

                def log_message(self, _format, *_args):
                    return

            server = HTTPServer(("127.0.0.1", 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(thread.join, 5)
            self.addCleanup(server.shutdown)
            env = {
                **os.environ,
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "SYMPHONY_ELIXIR_HOME": str(target_home),
                "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                "XDG_RUNTIME_DIR": str(runtime),
                "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime / 'bus'}",
                "SYMPHONY_STATE_URL": (
                    f"http://127.0.0.1:{server.server_address[1]}/api/v1/state"
                ),
                "SYSTEMCTL_EVENTS": str(root / "systemctl-events"),
                "ALLOW_RESTART_ONCE": str(root / "allow-restart-once"),
            }
            unsafe_prior = {
                workflow: workflow.read_bytes(),
                helper: helper.read_bytes(),
                unit: unit.read_bytes(),
            }
            safe_prior = {
                workflow: WORKFLOW_PATH.read_bytes(),
                helper: HELPER_PATH.read_bytes(),
                unit: UNIT_PATH.read_bytes(),
            }
            transaction = target_home / ".local/state/symphony-elixir/promotion-transaction"
            transaction.mkdir(parents=True)
            (transaction / "binary.missing").touch()
            (transaction / "was-active").touch()
            for key, path in (("workflow", workflow), ("helper", helper), ("unit", unit)):
                (transaction / key).write_bytes(safe_prior[path])
            manifest = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in transaction.iterdir()
                if path.is_file()
            }
            (transaction / "manifest.json").write_text(json.dumps(manifest))
            (transaction / "READY").write_text("symphony-promotion-transaction/v1\n")
            hold = target_home / ".local/state/symphony-elixir/promotion-held.json"
            hold.write_text(json.dumps({
                "schema": "symphony-promotion-hold/v1",
                "status": "held",
                "reason": "rollback_restart_failed",
                "transaction": str(transaction),
            }))
            known = target_home / ".local/state/symphony-elixir/candidates/known-good"
            known.mkdir(parents=True)
            candidate_files = {}
            for name, source in (
                ("workflow", WORKFLOW_PATH),
                ("helper", HELPER_PATH),
                ("unit", UNIT_PATH),
            ):
                target = known / name
                target.write_bytes(source.read_bytes())
                candidate_files[name] = hashlib.sha256(target.read_bytes()).hexdigest()
            (known / "manifest.json").write_text(json.dumps({
                "schema": "symphony-candidate/v2",
                "version": "known-good",
                "files": candidate_files,
            }))
            workflow.write_bytes(WORKFLOW_PATH.read_bytes())
            helper.write_bytes(HELPER_PATH.read_bytes())
            (root / "allow-restart-once").touch()
            recovered_cleanup_failure = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env={**env, "FAIL_FINALIZE_AFTER_REMOVE": "1"},
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(recovered_cleanup_failure.returncode, 0)
            self.assertIn(
                "RECOVERED_PRIOR_CLEANUP_FAILED",
                recovered_cleanup_failure.stderr,
            )
            self.assertNotIn(
                "PROMOTION_COMMITTED_CLEANUP_FAILED",
                recovered_cleanup_failure.stderr,
            )
            marker = (
                target_home
                / ".local/state/symphony-elixir/.promotion-transaction.cleanup-pending"
            )
            self.assertEqual(
                marker.read_text(), "symphony-promotion-cleanup-pending/v1\n"
            )
            recovered_receipt = json.loads(
                (
                    target_home
                    / ".local/state/symphony-elixir/promotion-recovered.json"
                ).read_text()
            )
            self.assertEqual(recovered_receipt["status"], "restored-prior")
            self.assertEqual(recovered_receipt["cleanupStatus"], "pending")
            self.assertEqual(recovered_receipt["transaction"], str(transaction))
            events_before_recovery_acknowledgement = (
                root / "systemctl-events"
            ).read_text().splitlines()
            self.assertEqual(
                len(
                    [
                        row
                        for row in events_before_recovery_acknowledgement
                        if "restart symphony-elixir.service" in row
                    ]
                ),
                1,
            )
            config_only = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(config_only.returncode, 0, config_only.stderr)
            self.assertIn("RECOVERED_TRANSACTION_CLEANUP", config_only.stdout)
            self.assertNotIn("DONE_STAGED_NO_LIVE_MUTATION", config_only.stdout)
            self.assertFalse(marker.exists())
            recovered_receipt = json.loads(
                (
                    target_home
                    / ".local/state/symphony-elixir/promotion-recovered.json"
                ).read_text()
            )
            self.assertEqual(recovered_receipt["cleanupStatus"], "complete")
            self.assertEqual(
                (root / "systemctl-events").read_text().splitlines(),
                events_before_recovery_acknowledgement,
            )
            self.assertFalse(hold.exists())
            for path, expected in safe_prior.items():
                self.assertEqual(path.read_bytes(), expected)
            events_before_activation = (
                root / "systemctl-events"
            ).read_text().splitlines()
            self.assertEqual(
                len([row for row in events_before_activation if "restart symphony-elixir.service" in row]),
                1,
            )

            for path, expected in unsafe_prior.items():
                path.write_bytes(expected)
            (root / "allow-restart-once").touch()
            committed_cleanup_failure = subprocess.run(
                ["bash", str(updater), "--skip-binary"],
                cwd=ROOT,
                env={**env, "FAIL_FINALIZE_AFTER_REMOVE": "1"},
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                committed_cleanup_failure.returncode,
                0,
                committed_cleanup_failure.stderr,
            )
            self.assertIn("PROMOTION_COMMITTED", committed_cleanup_failure.stderr)
            self.assertNotIn("PROMOTION_ROLLED_BACK", committed_cleanup_failure.stderr)
            committed_events = (root / "systemctl-events").read_text().splitlines()
            committed_restart_events = [
                row
                for row in committed_events
                if "restart symphony-elixir.service" in row
            ]
            self.assertEqual(
                len(committed_restart_events),
                len(
                    [
                        row
                        for row in events_before_activation
                        if "restart symphony-elixir.service" in row
                    ]
                )
                + 1,
                committed_events,
            )
            marker = (
                target_home
                / ".local/state/symphony-elixir/.promotion-transaction.cleanup-pending"
            )
            self.assertEqual(
                marker.read_text(), "symphony-promotion-cleanup-pending/v1\n"
            )
            self.assertFalse(transaction.exists())
            self.assertFalse(
                (target_home / ".local/state/symphony-elixir/.promotion-transaction.removing").exists()
            )
            self.assertFalse(hold.exists())
            finalized = json.loads(
                (
                    target_home
                    / ".local/state/symphony-elixir/promotion-finalized.json"
                ).read_text()
            )
            self.assertEqual(finalized["status"], "committed")
            self.assertEqual(finalized["cleanupStatus"], "pending")
            self.assertEqual(finalized["transaction"], str(transaction))
            for path, expected in safe_prior.items():
                self.assertEqual(path.read_bytes(), expected)

            acknowledged = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(acknowledged.returncode, 0, acknowledged.stderr)
            self.assertIn(
                "RECOVERED_TRANSACTION_CLEANUP",
                acknowledged.stdout,
                acknowledged.stderr,
            )
            self.assertFalse(marker.exists())
            finalized = json.loads(
                (
                    target_home
                    / ".local/state/symphony-elixir/promotion-finalized.json"
                ).read_text()
            )
            self.assertEqual(finalized["status"], "committed")
            self.assertEqual(finalized["cleanupStatus"], "complete")

            transaction.mkdir()
            (transaction / "binary.missing").touch()
            for key, path in (("workflow", workflow), ("helper", helper), ("unit", unit)):
                (transaction / key).write_bytes(unsafe_prior[path])
            manifest = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in transaction.iterdir()
                if path.is_file()
            }
            (transaction / "manifest.json").write_text(json.dumps(manifest))
            (transaction / "READY").write_text(
                "symphony-promotion-transaction/v1\n"
            )
            finalized["cleanupStatus"] = "pending"
            (
                target_home
                / ".local/state/symphony-elixir/promotion-finalized.json"
            ).write_text(json.dumps(finalized))
            crash_after_commit = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(crash_after_commit.returncode, 0, crash_after_commit.stderr)
            self.assertIn("RECOVERED_TRANSACTION_CLEANUP", crash_after_commit.stdout)
            self.assertNotIn("RECOVERED_INCOMPLETE_PROMOTION", crash_after_commit.stdout)
            self.assertFalse(transaction.exists())
            for path, expected in safe_prior.items():
                self.assertEqual(path.read_bytes(), expected)

            normal_events_before = (
                root / "systemctl-events"
            ).read_text().splitlines()
            (root / "allow-restart-once").touch()
            normal_success = subprocess.run(
                ["bash", str(updater), "--skip-binary"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(normal_success.returncode, 0, normal_success.stderr)
            self.assertIn("DONE", normal_success.stdout)
            finalized = json.loads(
                (
                    target_home
                    / ".local/state/symphony-elixir/promotion-finalized.json"
                ).read_text()
            )
            self.assertEqual(finalized["status"], "committed")
            self.assertEqual(finalized["cleanupStatus"], "complete")
            self.assertEqual(finalized["transaction"], str(transaction))
            normal_events_after = (
                root / "systemctl-events"
            ).read_text().splitlines()
            self.assertEqual(
                len(
                    [
                        row
                        for row in normal_events_after
                        if "restart symphony-elixir.service" in row
                    ]
                ),
                len(
                    [
                        row
                        for row in normal_events_before
                        if "restart symphony-elixir.service" in row
                    ]
                )
                + 1,
            )

            for path, expected in unsafe_prior.items():
                path.write_bytes(expected)

            activation = subprocess.run(
                ["bash", str(updater), "--skip-binary"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(activation.returncode, 0)
            self.assertIn("PROMOTION_HELD", activation.stderr)
            events = (root / "systemctl-events").read_text().splitlines()
            self.assertTrue(any("stop symphony-elixir.service" in row for row in events))
            restart_events = [
                row for row in events if "restart symphony-elixir.service" in row
            ]
            self.assertEqual(len(restart_events), 4, events)
            for path, expected in safe_prior.items():
                self.assertEqual(path.read_bytes(), expected)
            self.assertNotIn("scripts/hermes/symphony-", workflow.read_text())
            self.assertTrue(hold.is_file())
            self.assertEqual(json.loads(hold.read_text())["status"], "held")
            self.assertTrue(transaction.is_dir())
            retained_manifest = json.loads((transaction / "manifest.json").read_text())
            self.assertIn("was-active", retained_manifest)
            self.assertEqual(
                set(retained_manifest),
                {
                    path.name
                    for path in transaction.iterdir()
                    if path.is_file()
                } - {"manifest.json", "READY"},
            )

    def test_recovery_restart_double_failure_retains_transaction_and_hold(self):
        updater = ROOT / "scripts/symphony/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            target_home = root / "home"
            config = target_home / ".config/symphony"
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            config.mkdir(parents=True)
            (config / "codex-account.env").write_text(f"CODEX_HOME={account_home}\n")
            (config / "codex-account.env").chmod(0o600)
            workflow = config / "WORKFLOW.md"
            helper = target_home / ".local/bin/symphony-official-runtime"
            unit = target_home / ".config/systemd/user/symphony-elixir.service"
            helper.parent.mkdir(parents=True)
            unit.parent.mkdir(parents=True)
            for target in (workflow, helper, unit):
                target.write_text("unsafe live file\n")

            state = target_home / ".local/state/symphony-elixir"
            transaction = state / "promotion-transaction"
            transaction.mkdir(parents=True)
            (transaction / "binary.missing").touch()
            (transaction / "was-active").touch()
            for name, source in (
                ("workflow", WORKFLOW_PATH),
                ("helper", HELPER_PATH),
                ("unit", UNIT_PATH),
            ):
                (transaction / name).write_bytes(source.read_bytes())
            manifest = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in transaction.iterdir()
                if path.is_file()
            }
            (transaction / "manifest.json").write_text(json.dumps(manifest))
            (transaction / "READY").write_text("symphony-promotion-transaction/v1\n")

            known = state / "candidates/known-good"
            known.mkdir(parents=True)
            candidate_files = {}
            for name, source in (
                ("workflow", WORKFLOW_PATH),
                ("helper", HELPER_PATH),
                ("unit", UNIT_PATH),
            ):
                target = known / name
                target.write_bytes(source.read_bytes())
                candidate_files[name] = hashlib.sha256(target.read_bytes()).hexdigest()
            (known / "manifest.json").write_text(json.dumps({
                "schema": "symphony-candidate/v2",
                "version": "known-good",
                "files": candidate_files,
            }))

            fake_bin = root / "bin"
            fake_bin.mkdir()
            events = root / "systemctl-events"
            systemctl = fake_bin / "systemctl"
            mode = root / "systemctl-mode"
            mode.write_text("restart-fails\n")
            systemctl.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' \"$*\" >> \"$SYSTEMCTL_EVENTS\"\n"
                "mode=$(cat \"$SYSTEMCTL_MODE\")\n"
                "case \"$*\" in\n"
                "  *'daemon-reload'*) [ \"$mode\" != daemon-reload-fails ];;\n"
                "  *'restart symphony-elixir.service'*) "
                "if [ \"$mode\" = restart-fails ]; then exit 1; fi; "
                "if [ \"$mode\" = restart-fails-once ] && [ ! -f \"$RESTART_ONCE\" ]; "
                "then touch \"$RESTART_ONCE\"; exit 1; fi;;\n"
                "  *'show symphony-elixir.service --property=MainPID --value'*) printf '4242\\n';;\n"
                "  *'is-active --quiet symphony-elixir.service'*) [ \"$mode\" != inactive ];;\n"
                "  *) exit 0;;\n"
                "esac\n"
            )
            systemctl.chmod(0o755)
            curl = fake_bin / "curl"
            curl.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' '{\"counts\":{\"running\":0},"
                "\"polling\":{\"checking\":false,\"next_poll_in_ms\":10000}}'\n"
            )
            curl.chmod(0o755)
            python = fake_bin / "python3"
            python.write_text(
                "#!/usr/bin/env bash\n"
                f"real={sys.executable!s}\n"
                "if [ \"${1:-}\" != - ]; then exec \"$real\" \"$@\"; fi\n"
                "payload=$(mktemp)\n"
                "trap 'rm -f \"$payload\" \"$payload.injected\"' EXIT\n"
                "cat > \"$payload\"\n"
                "if [ \"${FAIL_FINALIZE_AFTER_HOLD:-0}\" = 1 ] && "
                "grep -q 'shutil.rmtree(tombstone)' \"$payload\"; then\n"
                "  sed 's/    shutil.rmtree(tombstone)/    raise OSError(\"injected post-hold failure\")/' "
                "\"$payload\" > \"$payload.injected\"\n"
                "  exec \"$real\" \"$payload.injected\" \"${@:2}\"\n"
                "fi\n"
                "exec \"$real\" \"$payload\" \"${@:2}\"\n"
            )
            python.chmod(0o755)
            runtime = root / "runtime"
            runtime.mkdir()
            bus = socket.socket(socket.AF_UNIX)
            bus.bind(str(runtime / "bus"))
            self.addCleanup(bus.close)

            class StateHandler(BaseHTTPRequestHandler):
                def do_GET(self):
                    body = json.dumps({
                        "counts": {"running": 0},
                        "polling": {"checking": False, "next_poll_in_ms": 10000},
                    }).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

                def log_message(self, _format, *_args):
                    return

            server = HTTPServer(("127.0.0.1", 0), StateHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(thread.join, 5)
            self.addCleanup(server.shutdown)
            recovery_env = {
                **os.environ,
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "SYMPHONY_ELIXIR_HOME": str(target_home),
                "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                "XDG_RUNTIME_DIR": str(runtime),
                "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime / 'bus'}",
                "SYSTEMCTL_EVENTS": str(events),
                "SYSTEMCTL_MODE": str(mode),
                "RESTART_ONCE": str(root / "restart-once"),
                "SYMPHONY_RECOVERY_VERIFY_ATTEMPTS": "1",
                "SYMPHONY_STATE_URL": (
                    f"http://127.0.0.1:{server.server_address[1]}/api/v1/state"
                ),
            }
            result = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env=recovery_env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("RECOVERED_INCOMPLETE_PROMOTION", result.stdout)
            self.assertIn("service restart is unverified", result.stderr)
            self.assertTrue(transaction.is_dir())
            hold = json.loads((state / "promotion-held.json").read_text())
            self.assertEqual(hold["reason"], "rollback_restart_failed")
            restart_events = [
                row for row in events.read_text().splitlines()
                if "restart symphony-elixir.service" in row
            ]
            self.assertEqual(len(restart_events), 2, restart_events)

            mode.write_text("inactive\n")
            inactive = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env=recovery_env, capture_output=True, text=True,
            )
            self.assertNotEqual(inactive.returncode, 0)
            self.assertNotIn("RECOVERED_INCOMPLETE_PROMOTION", inactive.stdout)
            self.assertTrue(transaction.is_dir())
            self.assertTrue((state / "promotion-held.json").is_file())

            mode.write_text("daemon-reload-fails\n")
            reload_failure = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env=recovery_env, capture_output=True, text=True,
            )
            self.assertNotEqual(reload_failure.returncode, 0)
            self.assertTrue(transaction.is_dir())
            self.assertEqual(
                json.loads((state / "promotion-held.json").read_text())["reason"],
                "rollback_restart_failed",
            )

            hold_path = state / "promotion-held.json"
            mismatched = json.loads(hold_path.read_text())
            mismatched["transaction"] = str(state / "different-transaction")
            hold_path.write_text(json.dumps(mismatched))
            mode.write_text("success\n")
            clear_failure = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env=recovery_env, capture_output=True, text=True,
            )
            self.assertNotEqual(clear_failure.returncode, 0)
            self.assertNotIn("DONE", clear_failure.stdout)
            self.assertTrue(transaction.is_dir())

            hold_path.write_text(json.dumps({
                **mismatched,
                "transaction": str(transaction),
            }))
            mode.write_text("restart-fails-once\n")
            events_before_cleanup = events.read_text().splitlines()
            recovered = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env=recovery_env, capture_output=True, text=True,
            )
            self.assertEqual(recovered.returncode, 0, recovered.stderr)
            self.assertIn("RECOVERED_TRANSACTION_CLEANUP", recovered.stdout)
            self.assertNotIn("PROMOTION_ROLLED_BACK", recovered.stderr)
            self.assertEqual(events.read_text().splitlines(), events_before_cleanup)
            self.assertFalse(transaction.exists())
            self.assertFalse((state / "promotion-held.json").exists())
            recovered_receipt = json.loads(
                (state / "promotion-recovered.json").read_text()
            )
            self.assertEqual(recovered_receipt["status"], "restored-prior")
            self.assertEqual(recovered_receipt["cleanupStatus"], "complete")
            self.assertEqual(recovered_receipt["transaction"], str(transaction))

            transaction.mkdir()
            (transaction / "binary.missing").touch()
            (transaction / "was-active").touch()
            for name, source in (
                ("workflow", WORKFLOW_PATH), ("helper", HELPER_PATH), ("unit", UNIT_PATH)
            ):
                (transaction / name).write_bytes(source.read_bytes())
            manifest = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in transaction.iterdir() if path.is_file()
            }
            (transaction / "manifest.json").write_text(json.dumps(manifest))
            (transaction / "READY").write_text("symphony-promotion-transaction/v1\n")
            mode.write_text("success\n")
            hold_path.write_text(json.dumps({
                **mismatched,
                "transaction": str(transaction),
            }))
            removal_failure = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env={**recovery_env, "FAIL_FINALIZE_AFTER_HOLD": "1"},
                capture_output=True, text=True,
            )
            self.assertNotEqual(removal_failure.returncode, 0)
            self.assertNotIn("DONE", removal_failure.stdout)
            tombstone = state / ".promotion-transaction.removing"
            self.assertFalse(transaction.exists())
            self.assertFalse(hold_path.exists())
            self.assertTrue(tombstone.is_dir())
            events_before_cleanup = events.read_text().splitlines()
            retry = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT, env=recovery_env, capture_output=True, text=True,
            )
            self.assertEqual(retry.returncode, 0, retry.stderr)
            self.assertIn("cleanup acknowledgement remains pending", retry.stderr)
            self.assertTrue(tombstone.exists())
            self.assertEqual(events.read_text().splitlines(), events_before_cleanup)
            recovered_receipt = json.loads(
                (state / "promotion-recovered.json").read_text()
            )
            self.assertEqual(recovered_receipt["status"], "restored-prior")
            self.assertEqual(recovered_receipt["cleanupStatus"], "pending")
            self.assertEqual(recovered_receipt["transaction"], str(transaction))

    def test_transaction_removal_is_persisted_before_success(self):
        helper = UPDATER[UPDATER.index("finalize_rollback_transaction() {"):
                         UPDATER.index("backup_target() {")]
        self.assertIn("os.replace(transaction, tombstone)", helper)
        self.assertIn("symphony-promotion-cleanup-pending/v1", helper)
        self.assertIn("shutil.rmtree(tombstone)", helper)
        self.assertIn("os.fsync(descriptor)", helper)
        self.assertNotIn('rm -rf "$rollback_dir"', UPDATER)
        self.assertIn("symphony-promotion-finalized/v1", UPDATER)
        self.assertIn("symphony-promotion-recovered/v1", UPDATER)
        self.assertLess(
            UPDATER.rindex("write_finalized_receipt pending\n"),
            UPDATER.rindex("promotion_complete=1\n"),
        )
        self.assertLess(
            UPDATER.rindex("write_finalized_receipt complete\n"),
            UPDATER.rindex('rollback_dir=""\n'),
        )
        self.assertLess(UPDATER.rindex("finalize_rollback_transaction\n"),
                        UPDATER.rindex('echo "DONE"'))

    def test_post_delete_fsync_failure_retains_recoverable_cleanup_marker(self):
        helper = UPDATER[UPDATER.index("finalize_rollback_transaction() {"):
                         UPDATER.index("backup_target() {")]
        payload = helper.split("<<'PY'\n", 1)[1].split("\nPY\n}", 1)[0]
        injected = payload.replace(
            "    shutil.rmtree(tombstone)\n    fsync_root()",
            "    shutil.rmtree(tombstone)\n"
            "    raise OSError('injected post-delete fsync failure')",
            1,
        )
        self.assertNotEqual(injected, payload)
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            transaction = root / "promotion-transaction"
            transaction.mkdir()
            hold = root / "promotion-held.json"
            hold.write_text(json.dumps({
                "schema": "symphony-promotion-hold/v1",
                "status": "held",
                "transaction": str(transaction),
            }))
            environment = {**os.environ, "ROLLBACK_DIR": str(transaction)}
            failed = subprocess.run(
                [sys.executable, "-", str(root)], input=injected, text=True,
                env=environment, capture_output=True,
            )
            self.assertNotEqual(failed.returncode, 0)
            marker = root / ".promotion-transaction.cleanup-pending"
            self.assertFalse(transaction.exists())
            self.assertFalse(hold.exists())
            self.assertFalse((root / ".promotion-transaction.removing").exists())
            self.assertEqual(
                marker.read_text(), "symphony-promotion-cleanup-pending/v1\n"
            )
            recovered = subprocess.run(
                [sys.executable, "-", str(root)], input=payload, text=True,
                env=environment, capture_output=True,
            )
            self.assertEqual(recovered.returncode, 0, recovered.stderr)
            self.assertFalse(marker.exists())

    def test_updater_lock_is_owned_by_parent_file_descriptor(self):
        updater = ROOT / "scripts/symphony/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            target_home = pathlib.Path(tmp) / "home"
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            config = target_home / ".config/symphony"
            config.mkdir(parents=True)
            account_env = config / "codex-account.env"
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            state = target_home / ".local/state/symphony-elixir"
            state.mkdir(parents=True)
            descriptor = os.open(state / "update.lock", os.O_RDWR | os.O_CREAT, 0o600)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = subprocess.run(
                    ["bash", str(updater), "--skip-binary", "--no-restart"],
                    cwd=ROOT,
                    env={
                        **os.environ,
                        "SYMPHONY_ELIXIR_HOME": str(target_home),
                        "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                    },
                    capture_output=True,
                    text=True,
                )
            finally:
                os.close(descriptor)
            self.assertEqual(result.returncode, 8, result.stderr)
            self.assertIn("updater lock is held", result.stderr)
            self.assertIn('exec 9>"$update_lock"', UPDATER)
            self.assertNotIn("lock_holder_pid=\"$!\"", UPDATER)

    def test_incomplete_promotion_transaction_fails_before_live_mutation(self):
        updater = ROOT / "scripts/symphony/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            target_home = pathlib.Path(tmp) / "home"
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            config = target_home / ".config/symphony"
            config.mkdir(parents=True)
            account_env = config / "codex-account.env"
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            workflow = config / "WORKFLOW.md"
            workflow.write_text("live sentinel\n")
            transaction = target_home / ".local/state/symphony-elixir/promotion-transaction"
            transaction.mkdir(parents=True)
            (transaction / "workflow").write_text("truncated backup\n")
            result = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env={
                    **os.environ,
                    "SYMPHONY_ELIXIR_HOME": str(target_home),
                    "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                },
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 9, result.stderr)
            self.assertIn("incomplete rollback transaction", result.stderr)
            self.assertEqual(workflow.read_text(), "live sentinel\n")

    def test_deliberate_red_promotion_gates_before_mutation_and_masks_legacy(self):
        account_guard = UPDATER.index("assert_account_environment_ready\n")
        stop = UPDATER.index("  stop_idle_official_for_restart\n")
        first_install = UPDATER.index(
            'install_one "$candidate_dir/helper" "$HELPER_DST" 0755'
        )
        retirement = UPDATER.index("  retire_legacy_units\n")
        restart = UPDATER.index(
            '  systemctl --user restart "$SERVICE_NAME"', retirement
        )
        self.assertLess(account_guard, first_install)
        self.assertLess(stop, first_install)
        self.assertNotIn("assert_no_active_agents_interrupted", UPDATER)
        self.assertIn("stop_idle_official_for_restart()", UPDATER)
        self.assertNotIn('> "$ACCOUNT_ENV"', UPDATER)
        self.assertNotIn('install_one "$ACCOUNT_ENV"', UPDATER)
        self.assertLess(retirement, restart)
        self.assertIn("MIN_RESTART_NEXT_POLL_MS", UPDATER)
        self.assertIn("polling.next_poll_in_ms", UPDATER)
        self.assertIn('systemctl --user stop "$SERVICE_NAME"', UPDATER)
        self.assertIn('systemctl --user mask --now "${LEGACY_UNITS[@]}"', UPDATER)
        for unit in (
            "symphony-ui-pilot.service",
            "symphony-reconciler.service",
            "symphony-reconciler.timer",
            "symphony-burrito.service",
            "symphony-burrito-update.service",
            "symphony-burrito-update.timer",
        ):
            self.assertIn(unit, UPDATER)
        # The grok/kimi sidecar is the ACTIVE coding lane (Tim, 2026-09-03),
        # owned by install-symphony-grok-sidecar.sh — the updater must never
        # retire or mask it, so it must not appear in LEGACY_UNITS.
        legacy_block = UPDATER.split("LEGACY_UNITS=(", 1)[1].split(")", 1)[0]
        self.assertNotIn("symphony-grok-sidecar", legacy_block)
        self.assertIn('temporary="${dst}.tmp.$$"', UPDATER)
        self.assertIn('mv "$temporary" "$dst"', UPDATER)
        self.assertIn("PROMOTION_ROLLED_BACK", UPDATER)
        self.assertIn(
            'if [ "$RESTART" -eq 1 ] || [ "$RETIRE_LEGACY" -eq 1 ]; then',
            UPDATER,
        )

    def test_deliberate_red_promotion_fails_closed_when_state_api_is_unavailable(self):
        self.assertNotIn("<<'PY' || true", UPDATER)
        self.assertIn("cannot prove the official runtime is idle", UPDATER)
        self.assertIn("state API response has invalid counts.running", UPDATER)
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = pathlib.Path(tmp) / "bin"
            bin_dir.mkdir()
            fake_systemctl = bin_dir / "systemctl"
            fake_systemctl.write_text(
                "#!/usr/bin/env bash\n"
                "case \"$*\" in\n"
                "  *\"show-environment\"*) exit 0 ;;\n"
                "esac\n"
                "exit 1\n",
                encoding="utf-8",
            )
            fake_systemctl.chmod(0o755)
            runtime_dir = pathlib.Path(tmp) / "runtime"
            runtime_dir.mkdir()
            bus = socket.socket(socket.AF_UNIX)
            bus.bind(str(runtime_dir / "bus"))
            bus.listen(1)
            target_home = pathlib.Path(tmp) / "home"
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            account_env = target_home / ".config/symphony/codex-account.env"
            account_env.parent.mkdir(parents=True)
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            try:
                result = subprocess.run(
                    [
                        "bash",
                        str(ROOT / "scripts/symphony/update-symphony-burrito.sh"),
                        "--skip-binary",
                    ],
                    cwd=ROOT,
                    env={
                        **os.environ,
                        "PATH": f"{bin_dir}:{os.environ['PATH']}",
                        "XDG_RUNTIME_DIR": str(runtime_dir),
                        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime_dir / 'bus'}",
                        "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                        "SYMPHONY_ELIXIR_HOME": str(target_home),
                        "SYMPHONY_STATE_URL": "http://127.0.0.1:9/api/v1/state",
                    },
                    capture_output=True,
                    text=True,
                )
            finally:
                bus.close()
            self.assertEqual(result.returncode, 6, result.stderr)
            self.assertIn("cannot prove the official runtime is idle", result.stderr)
            self.assertFalse(
                (target_home / ".config/systemd/user/symphony-elixir.service").exists()
            )

    def test_deliberate_red_promotion_requires_host_owned_account_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_home = pathlib.Path(tmp) / "home"
            result = subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/symphony/update-symphony-burrito.sh"),
                    "--skip-binary",
                    "--no-restart",
                ],
                cwd=ROOT,
                env={
                    **os.environ,
                    "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                    "SYMPHONY_ELIXIR_HOME": str(target_home),
                },
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 8, result.stderr)
            self.assertIn("host-owned Codex account selection is missing", result.stderr)
            self.assertFalse(
                (target_home / ".config/systemd/user/symphony-elixir.service").exists()
            )

    def test_deliberate_red_activation_cannot_reinstall_custom_runtime(self):
        activation = (
            ROOT / ".github/workflows/gem-delivery-controller-activation.yml"
        ).read_text(encoding="utf-8")
        fleet = (ROOT / "scripts/symphony/install-gem-fleet-controller.sh").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("install-symphony-ui-pilot.sh", activation)
        self.assertIn(
            "update-symphony-burrito.sh --skip-binary",
            activation,
        )
        self.assertNotIn("--no-restart --retire-legacy", activation)
        self.assertNotIn('test "$main_pid" = "$after_pid"', activation)
        self.assertIn('readonly SERVICE="symphony-elixir.service"', fleet)
        self.assertIn("scripts/symphony/systemd/symphony-elixir.service", fleet)
        self.assertNotIn("scripts/symphony/systemd/symphony-ui-pilot.service", fleet)
        self.assertIn('"service": "symphony-elixir.service"', fleet)
        self.assertIn('ss -ltnp \'sport = :4041\'', fleet)
        self.assertIn("symphony-elixir.service", activation)
        self.assertIn("LoadState --value", activation)
        self.assertIn("test -z \"$(ss -H -ltn 'sport = :4043')\"", activation)

    def test_runtime_readback_reports_pid_api_lyb_and_legacy_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = pathlib.Path(tmp) / "bin"
            bin_dir.mkdir()
            fake_systemctl = bin_dir / "systemctl"
            fake_systemctl.write_text(
                "#!/usr/bin/env bash\n"
                "case \"$*\" in\n"
                "  *\"show symphony-\"*\"LoadState\"*) printf 'masked\\n'; exit 0 ;;\n"
                "  *\"is-active --quiet symphony-elixir.service\"*) exit 0 ;;\n"
                "  *\"show symphony-elixir.service\"*) printf '4242\\n'; exit 0 ;;\n"
                "  *\"is-active --quiet symphony-lyb.service\"*) exit 0 ;;\n"
                "  *\"is-enabled --quiet\"*) exit 1 ;;\n"
                "esac\n"
                "exit 0\n",
                encoding="utf-8",
            )
            fake_systemctl.chmod(0o755)
            fake_curl = bin_dir / "curl"
            fake_curl.write_text("#!/usr/bin/env bash\nprintf '{}\\n'\n", encoding="utf-8")
            fake_curl.chmod(0o755)
            result = subprocess.run(
                ["bash", str(ROOT / "scripts/symphony/update-symphony-burrito.sh"), "--runtime-readback"],
                cwd=ROOT,
                env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"},
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for token in (
                "SERVICE symphony-elixir.service",
                "STATE active",
                "PID 4242",
                "API_OK http://127.0.0.1:4041/api/v1/state",
                "LYB_ACTIVE symphony-lyb.service 127.0.0.1:4042",
                "LYB_API_OK http://127.0.0.1:4042/api/v1/state",
                "LEGACY_MASKED symphony-ui-pilot.service",
                "LEGACY_MASKED symphony-burrito.service",
                "SOURCE_HASH workflow=",
                "SOURCE_HASH unit=",
            ):
                self.assertIn(token, result.stdout)

    def test_restart_refuses_active_leases(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                body = json.dumps(
                    {
                        "counts": {"running": 1, "retrying": 0, "blocked": 0},
                        "running": [{"issue_identifier": "JOV-1"}],
                        "polling": {"checking": False, "next_poll_in_ms": 25000},
                    }
                ).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format, *args):
                return

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                bin_dir = pathlib.Path(tmp) / "bin"
                bin_dir.mkdir()
                fake_systemctl = bin_dir / "systemctl"
                fake_systemctl.write_text(
                    "#!/usr/bin/env bash\n"
                    "case \"$*\" in\n"
                    "  *\"show-environment\"*) exit 0 ;;\n"
                    "  *\"is-active --quiet symphony-elixir.service\"*) exit 0 ;;\n"
                    "  *\"show symphony-elixir.service\"*) printf '4242\\n'; exit 0 ;;\n"
                    "esac\n"
                    "exit 1\n",
                    encoding="utf-8",
                )
                fake_systemctl.chmod(0o755)
                runtime_dir = pathlib.Path(tmp) / "runtime"
                runtime_dir.mkdir()
                bus = socket.socket(socket.AF_UNIX)
                bus.bind(str(runtime_dir / "bus"))
                bus.listen(1)
                target_home = pathlib.Path(tmp) / "home"
                account_home = target_home / ".codex-accounts/meetjovie"
                account_home.mkdir(parents=True)
                account_env = target_home / ".config/symphony/codex-account.env"
                account_env.parent.mkdir(parents=True)
                account_env.write_text(f"CODEX_HOME={account_home}\n")
                account_env.chmod(0o600)
                try:
                    result = subprocess.run(
                        [
                            "bash",
                            str(ROOT / "scripts/symphony/update-symphony-burrito.sh"),
                            "--skip-binary",
                        ],
                        cwd=ROOT,
                        env={
                            **os.environ,
                            "PATH": f"{bin_dir}:{os.environ['PATH']}",
                            "XDG_RUNTIME_DIR": str(runtime_dir),
                            "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime_dir / 'bus'}",
                            "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                            "SYMPHONY_ELIXIR_HOME": str(target_home),
                            "SYMPHONY_STATE_URL": f"http://127.0.0.1:{server.server_address[1]}/api/v1/state",
                        },
                        capture_output=True,
                        text=True,
                    )
                finally:
                    bus.close()
                self.assertEqual(result.returncode, 6, result.stderr)
                self.assertIn("active official agents would be interrupted", result.stderr)
                self.assertFalse(
                    (target_home / ".config/systemd/user/symphony-elixir.service").exists()
                )
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
