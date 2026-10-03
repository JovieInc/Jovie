#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import datetime as dt
import io
import os
import pathlib
import re
import socket
import subprocess
import tempfile
import threading
import unittest
import importlib.util
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / "scripts/hermes/symphony/WORKFLOW.md"
WORKFLOW = WORKFLOW_PATH.read_text(encoding="utf-8")
UNIT_PATH = ROOT / "scripts/hermes/systemd/symphony-elixir.service"
UNIT = UNIT_PATH.read_text(encoding="utf-8")
UPDATER = (ROOT / "scripts/hermes/update-symphony-burrito.sh").read_text(encoding="utf-8")
HELPER_PATH = ROOT / "scripts/hermes/symphony_official_runtime.py"
LIVE_TEAM_KEY = "JOV"
TOKEN_RE = re.compile(r"lin_(?:api_|oauth_)?[A-Za-z0-9]{12,}|api_key:\s*(?!\$LINEAR_API_KEY\b)\S+")


def _load_helper():
    spec = importlib.util.spec_from_file_location("symphony_official_runtime", HELPER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _capacity_payload(observed_at, target=4):
    profiles = [f"{index + 1:064x}" for index in range(target)]
    rows = [
        {
            "schema": "gem-provider-useful-turn/v1",
            "provider": "openai",
            "profile": profile,
            "model": "gpt-5.6-sol",
            "completedAt": observed_at,
            "rc": 0,
            "useful": True,
            "outputDigest": f"{index + 101:064x}",
            "outputBytes": 12,
            "tokens": {"input": 20, "output": 4, "total": 24},
        }
        for index, profile in enumerate(profiles)
    ]
    return {
        "schema": "gem-concurrency-evidence/v1",
        "source": "execution-proven-useful-turns",
        "observedAt": observed_at,
        "target": target,
        "approved": target > 0,
        "severeIncidents": 0,
        "rows": rows,
        "providers": {
            "openai": {
                "enrolled": target,
                "enrolledProfiles": profiles,
                "ready": target,
            }
        },
        "ledger": {"schema": "gem-provider-useful-turn/v1"},
    }


def _fleet_gate_payload(
    status="healthy", intake=True, observed_at=None, *, capacity_ready=True
):
    observed = observed_at or (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    capacity = _capacity_payload(observed) if capacity_ready else {
        "schema": "gem-concurrency-evidence/v1",
        "source": "execution-proven-useful-turns",
        "observedAt": None,
        "target": 0,
        "approved": False,
        "severeIncidents": 0,
        "rows": [],
        "providers": {},
        "ledger": {"schema": "gem-provider-useful-turn/v1"},
    }
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
            },
            "concurrencyEvidence": {
                **capacity,
                "accepted": capacity_ready,
                "proofAccepted": capacity_ready,
                "actionableTarget": 4 if capacity_ready else 0,
            },
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
        "workAdmission": {
            "allowed": capacity_ready,
            "newIssueLeaseAllowed": intake and capacity_ready,
            "newImplementationAllowed": intake and capacity_ready,
            "activities": ["approved-issue-lease"] if intake and capacity_ready else [],
        },
        "concurrency": {
            "gem": {
                "evidenceAccepted": capacity_ready,
                "newMutationAllowed": capacity_ready,
                "maxConcurrent": 4 if capacity_ready else 0,
                "proofTarget": 4 if capacity_ready else None,
                "leaseCapacity": 4 if capacity_ready else None,
                "matchedCapacity": 4 if capacity_ready else 0,
                "matchedAvailableCapacity": 4 if capacity_ready else 0,
            }
        },
    }


def _closure_run_args(tmp):
    """Green fleet-gate fixture plus hermetic stop-line paths for run tests."""
    closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
    gate_payload = _fleet_gate_payload()
    closure_gate.write_text(json.dumps(gate_payload), encoding="utf-8")
    capacity = pathlib.Path(tmp) / "capacity.json"
    capacity.write_text(
        json.dumps(_capacity_payload(gate_payload["signals"]["concurrencyEvidence"]["observedAt"])),
        encoding="utf-8",
    )
    return [
        "--closure-gate-file",
        str(closure_gate),
        "--capacity-evidence-file",
        str(capacity),
        "--closure-hold-receipt",
        str(pathlib.Path(tmp) / "closure-hold.json"),
        "--dead-letter-dir",
        str(pathlib.Path(tmp) / "dead-letters"),
    ]


class OfficialSymphonyContractTests(unittest.TestCase):
    def test_live_queue_budget_and_no_root_workflow(self):
        """Official runtime is ~/.config/symphony/WORKFLOW.md; product clone is not a Symphony config."""
        helper = _load_helper()
        self.assertFalse((ROOT / "WORKFLOW.md").exists())
        self.assertFalse((ROOT / "scripts/hermes/systemd/symphony-burrito.service").exists())
        self.assertFalse((ROOT / "scripts/hermes/systemd/symphony-burrito-update.service").exists())
        self.assertFalse((ROOT / "scripts/hermes/systemd/symphony-burrito-update.timer").exists())
        self.assertTrue(WORKFLOW_PATH.is_file())
        self.assertTrue(UNIT_PATH.is_file())
        self.assertIn("%h/.config/symphony/WORKFLOW.md", UNIT)
        self.assertIn(f'team_key: "{LIVE_TEAM_KEY}"', WORKFLOW)
        self.assertNotIn("project_slug", WORKFLOW)
        self.assertNotIn("jovie-ba6736cbfbb9", WORKFLOW)
        self.assertIn("root: ~/symphony-elixir-workspaces", WORKFLOW)
        self.assertIn("timeout_ms: 900000", WORKFLOW)
        self.assertIn("max_concurrent_agents: 1", WORKFLOW)
        self.assertIn("api_key: $LINEAR_API_KEY", WORKFLOW)
        self.assertNotIn("required_labels:", WORKFLOW)
        self.assertIn("excluded_labels:", WORKFLOW)
        self.assertIn("    - no-symphony", WORKFLOW)
        self.assertIn("    - needs-human", WORKFLOW)
        self.assertRegex(
            WORKFLOW,
            re.compile(r"^\s+command: \./scripts/hermes/symphony-codex-router app-server$", re.M),
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

    def test_unit_binds_closure_stop_line_gate(self):
        helper = _load_helper()
        flag = "--closure-gate-file %h/gem-workspace/state/gem-priority-gate/latest.json"
        capacity_flag = "--capacity-evidence-file %h/gem-workspace/state/concurrency.json"
        self.assertIn(flag, UNIT)
        self.assertIn(capacity_flag, UNIT)
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
            variant.write_text(UNIT.replace(f"{capacity_flag} ", ""), encoding="utf-8")
            result = helper.validate_source(
                repo_root=ROOT,
                workflow_path=WORKFLOW_PATH,
                unit_path=variant,
                service_name="symphony-elixir.service",
                active_issues=helper.MEASURED_ACTIVE_ISSUES,
            )
            self.assertFalse(result["ok"])
            self.assertIn("unit_missing_capacity_evidence_stop_line", result["errors"])

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
            self.assertEqual(verdict["reason"], "fleet-work-admission-open")

    def test_green_closure_with_zero_capacity_holds_scheduler(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            closure_gate.write_text(
                json.dumps(_fleet_gate_payload(capacity_ready=False)),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(closure_gate)
            self.assertTrue(verdict["hold"])
            self.assertEqual(verdict["reason"], "work-capacity-admission-closed")
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
                    str(pathlib.Path(tmp) / "closure-hold.json"),
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

    def test_capacity_validator_rejects_python_bool_aliases_and_malformed_providers(self):
        helper = _load_helper()
        observed = "2026-09-03T11:59:00Z"
        now = dt.datetime(2026, 9, 3, 12, 0, tzinfo=dt.timezone.utc)

        def false_rc(payload):
            payload["rows"][0]["rc"] = False

        def boolean_provider_counts(payload):
            payload["providers"]["openai"].update(enrolled=True, ready=True)

        def malformed_extra_provider(payload):
            payload["providers"]["anthropic"] = {"enrolled": 0, "ready": 0}

        def malformed_provider_identity(payload):
            payload["providers"][" openai"] = payload["providers"].pop("openai")

        def noncanonical_time(payload):
            timestamp = "2026-09-03 11:59:00+00:00"
            payload["observedAt"] = timestamp
            payload["rows"][0]["completedAt"] = timestamp

        def out_of_range_offset(payload):
            timestamp = "2026-09-03T11:59:00+01:60"
            payload["observedAt"] = timestamp
            payload["rows"][0]["completedAt"] = timestamp

        for mutate in (
            false_rc,
            boolean_provider_counts,
            malformed_extra_provider,
            malformed_provider_identity,
            noncanonical_time,
            out_of_range_offset,
        ):
            with self.subTest(mutate=mutate.__name__):
                payload = _capacity_payload(observed, target=1)
                mutate(payload)
                accepted, _reason = helper._validate_capacity_evidence(payload, now)
                self.assertIsNone(accepted)

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

            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at="2026-09-03T11:59:00")),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(gate, now=now)
            self.assertEqual(
                verdict["reason"], "fleet-gate-receipt-observed-at-missing"
            )

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
            verdict = write_tampered(
                lambda payload: payload["signals"]["concurrencyEvidence"].pop(
                    "rows"
                )
            )
            self.assertEqual(
                verdict["reason"], "work-capacity-proof-invalid:rows"
            )
            verdict = write_tampered(
                lambda payload: payload["signals"]["concurrencyEvidence"][
                    "rows"
                ][0].update(profile="not-an-opaque-identity")
            )
            self.assertEqual(
                verdict["reason"],
                "work-capacity-proof-invalid:turn-shape-or-freshness",
            )
            verdict = write_tampered(
                lambda payload: payload["signals"]["concurrencyEvidence"][
                    "providers"
                ]["openai"].update(enrolledProfiles=["abc", 1])
            )
            self.assertEqual(
                verdict["reason"],
                "work-capacity-proof-invalid:provider-enrollment",
            )

            def expire_nested_proof(payload):
                evidence = payload["signals"]["concurrencyEvidence"]
                completed = "2026-09-02T11:58:00Z"
                evidence["observedAt"] = completed
                for row in evidence["rows"]:
                    row["completedAt"] = completed

            verdict = write_tampered(expire_nested_proof)
            self.assertEqual(
                verdict["reason"],
                "work-capacity-proof-invalid:turn-shape-or-freshness",
            )
            verdict = write_tampered(
                lambda payload: payload["signals"]["concurrencyEvidence"].update(
                    actionableTarget=1
                )
            )
            self.assertEqual(
                verdict["reason"], "work-capacity-admission-disagrees"
            )
            verdict = write_tampered(
                lambda payload: payload["concurrency"]["gem"].update(
                    matchedAvailableCapacity=0
                )
            )
            self.assertEqual(
                verdict["reason"], "work-capacity-admission-disagrees"
            )

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

    def test_current_capacity_contraction_holds_a_fresh_embedded_gate(self):
        helper = _load_helper()
        observed = "2026-09-03T11:59:00Z"
        now = dt.datetime(2026, 9, 3, 12, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "fleet-gate.json"
            capacity = pathlib.Path(tmp) / "capacity.json"
            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at=observed)),
                encoding="utf-8",
            )
            capacity.write_text(
                json.dumps(_capacity_payload(observed, target=3)),
                encoding="utf-8",
            )
            verdict = helper.read_closure_stop_line(
                gate, now=now, capacity_path=capacity
            )

        self.assertTrue(verdict["hold"])
        self.assertEqual(verdict["reason"], "work-capacity-proof-drift")

    def test_newer_capacity_proof_for_same_admitted_seats_remains_open(self):
        helper = _load_helper()
        embedded = "2026-09-03T11:58:00Z"
        current = "2026-09-03T11:59:00Z"
        now = dt.datetime(2026, 9, 3, 12, 0, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            gate = pathlib.Path(tmp) / "fleet-gate.json"
            capacity = pathlib.Path(tmp) / "capacity.json"
            gate.write_text(
                json.dumps(_fleet_gate_payload(observed_at=embedded)),
                encoding="utf-8",
            )
            capacity.write_text(
                json.dumps(_capacity_payload(current)), encoding="utf-8"
            )
            verdict = helper.read_closure_stop_line(
                gate, now=now, capacity_path=capacity
            )

        self.assertFalse(verdict["hold"])
        self.assertEqual(verdict["reason"], "fleet-work-admission-open")

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
            self.assertEqual(receipt["reason"], "fleet-work-admission-open")

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

    def test_silent_scheduler_is_paused_when_capacity_closes_mid_run(self):
        helper = _load_helper()
        with tempfile.TemporaryDirectory() as tmp:
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            hold = pathlib.Path(tmp) / "closure-hold.json"
            closure_gate.write_text(
                json.dumps(_fleet_gate_payload()), encoding="utf-8"
            )
            closure = helper.ClosureStopLine(
                receipt_path=closure_gate,
                hold_receipt_path=hold,
                dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
            )

            def close_capacity():
                helper.time.sleep(0.08)
                closure_gate.write_text(
                    json.dumps(_fleet_gate_payload(capacity_ready=False)),
                    encoding="utf-8",
                )

            closer = threading.Thread(target=close_capacity)
            closer.start()
            started = helper.time.monotonic()
            with mock.patch.object(helper, "CLOSURE_HOLD_RECHECK_SECONDS", 0.05):
                returncode = helper.run_official_binary_once(
                    ["python3", "-c", "import time; time.sleep(0.35)"],
                    gate_file=pathlib.Path(tmp) / "linear-rate-limit.json",
                    closure=closure,
                    max_gate_sleep_seconds=0.15,
                )
            elapsed = helper.time.monotonic() - started
            closer.join(timeout=1)
            self.assertEqual(returncode, -helper.signal.SIGKILL)
            self.assertGreaterEqual(elapsed, 0.18)
            self.assertLess(elapsed, 0.8)
            receipt = json.loads(hold.read_text(encoding="utf-8"))
            self.assertEqual(receipt["reason"], "work-capacity-admission-closed")
            self.assertIn(receipt["status"], {"holding", "exhausted"})

    def test_closure_hold_exhaustion_terminates_scheduler_for_safe_restart(self):
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
                        (process.pid, helper.signal.SIGKILL),
                    ],
                )
                receipt = json.loads(hold.read_text())
                self.assertEqual(receipt["status"], "exhausted")
                self.assertEqual(receipt["reason"], "closure-health-not-green")
                self.assertIn("closure_hold_wait_exhausted", out.getvalue())
        finally:
            process.terminate()
            process.wait(timeout=5)

    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux signal semantics")
    def test_linux_exhaustion_kills_a_group_stopped_scheduler(self):
        helper = _load_helper()
        process = subprocess.Popen(
            ["python3", "-c", "import time; time.sleep(30)"],
            cwd=ROOT,
            text=True,
        )
        with tempfile.TemporaryDirectory() as tmp:
            closure_gate = pathlib.Path(tmp) / "fleet-gate.json"
            closure_gate.write_text(
                json.dumps(_fleet_gate_payload(status="red", intake=False)),
                encoding="utf-8",
            )
            closure = helper.ClosureStopLine(
                receipt_path=closure_gate,
                hold_receipt_path=pathlib.Path(tmp) / "closure-hold.json",
                dead_letter_dir=pathlib.Path(tmp) / "dead-letters",
            )
            verdict = helper.read_closure_stop_line(closure_gate)
            helper._pause_child_for_closure_hold(process, closure, verdict, 0)
            self.assertEqual(process.wait(timeout=2), -helper.signal.SIGKILL)

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
        self.assertIn("scripts/hermes/symphony/WORKFLOW.md", UPDATER)
        self.assertIn("SOURCE_INVALID", UPDATER)
        self.assertIn("PROMOTION_RED", UPDATER)
        self.assertIn("http://127.0.0.1:4041/api/v1/state", UPDATER)
        tty1 = (ROOT / "scripts/hermes/gem-checkin-tty1.sh").read_text()
        self.assertIn("List HUD owns tty1", tty1)
        self.assertIn("gem-checkin-hud.py", tty1)
        self.assertNotIn("until a pickup has a PR", tty1)
        updater = ROOT / "scripts/hermes/update-symphony-burrito.sh"
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
        self.assertIn("BUDGET_OK steady=2060 budget=2500 headroom=440 pages=3 polls=120", dry.stdout)
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
            env.pop("SYMPHONY_WORKFLOW_SRC")
            good = subprocess.run(["bash", str(updater), "--skip-binary", "--no-restart"], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertIn(f'team_key: "{LIVE_TEAM_KEY}"', existing.read_text())
            unit = pathlib.Path(tmp) / "home/.config/systemd/user/symphony-elixir.service"
            helper = pathlib.Path(tmp) / "home/.local/bin/symphony-official-runtime"
            self.assertTrue(unit.is_file())
            self.assertTrue(helper.is_file())
            self.assertFalse((pathlib.Path(tmp) / "home/.config/systemd/user/symphony-burrito.service").exists())
            existing.write_text(
                existing.read_text().replace(
                    "max_concurrent_agents: 1", "max_concurrent_agents: 30"
                )
            )
            preserved = subprocess.run(
                ["bash", str(updater), "--skip-binary", "--no-restart"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(preserved.returncode, 0, preserved.stderr)
            self.assertIn("PRESERVED max_concurrent_agents=30", preserved.stdout)
            self.assertIn("max_concurrent_agents: 30", existing.read_text())
            existing.write_text(
                existing.read_text().replace(
                    "max_concurrent_agents: 30", "max_concurrent_agents: 4"
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

    def test_deliberate_red_promotion_gates_before_mutation_and_masks_legacy(self):
        account_guard = UPDATER.index("assert_account_environment_ready\n")
        stop = UPDATER.index("  stop_idle_official_for_restart\n")
        first_install = UPDATER.index('install_one "$HELPER_SRC" "$HELPER_DST" 0755')
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
                "  *\"is-active --quiet symphony-elixir.service\"*) exit 0 ;;\n"
                "  *\"show symphony-elixir.service --property=MainPID --value\"*) printf '4242\\n'; exit 0 ;;\n"
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
                        str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
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

    def test_inactive_official_service_starts_only_when_4041_is_unowned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            bin_dir = root / "bin"
            target_home = root / "home"
            runtime_dir = root / "runtime"
            marker = root / "started"
            bin_dir.mkdir()
            runtime_dir.mkdir()
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            account_env = target_home / ".config/symphony/codex-account.env"
            account_env.parent.mkdir(parents=True)
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            systemctl = bin_dir / "systemctl"
            systemctl.write_text(
                "#!/usr/bin/env bash\n"
                "case \"$*\" in\n"
                "  *\"show-environment\"*) exit 0 ;;\n"
                "  *\"is-active --quiet symphony-elixir.service\"*) [ -e \"$FAKE_STARTED\" ]; exit ;;\n"
                "  *\"is-active --quiet\"*) exit 1 ;;\n"
                "  *\"restart symphony-elixir.service\"*) : > \"$FAKE_STARTED\"; exit 0 ;;\n"
                "  *\"show symphony-elixir.service\"*) printf '4242\\n'; exit 0 ;;\n"
                "  *\"--property=LoadState --value\"*) printf 'masked\\n'; exit 0 ;;\n"
                "esac\n"
                "exit 0\n",
                encoding="utf-8",
            )
            systemctl.chmod(0o755)
            fake_ss = bin_dir / "ss"
            fake_ss.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            fake_ss.chmod(0o755)
            fake_curl = bin_dir / "curl"
            fake_curl.write_text(
                "#!/usr/bin/env bash\nprintf '{}\\n'\n", encoding="utf-8"
            )
            fake_curl.chmod(0o755)
            bus = socket.socket(socket.AF_UNIX)
            bus.bind(str(runtime_dir / "bus"))
            bus.listen(1)
            try:
                result = subprocess.run(
                    [
                        "bash",
                        str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
                        "--skip-binary",
                    ],
                    cwd=ROOT,
                    env={
                        **os.environ,
                        "PATH": f"{bin_dir}:{os.environ['PATH']}",
                        "FAKE_STARTED": str(marker),
                        "XDG_RUNTIME_DIR": str(runtime_dir),
                        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime_dir / 'bus'}",
                        "SYMPHONY_LINEAR_ACTIVE_ISSUES": "110",
                        "SYMPHONY_ELIXIR_HOME": str(target_home),
                    },
                    capture_output=True,
                    text=True,
                )
            finally:
                bus.close()
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertTrue(marker.exists())
            self.assertIn(
                "inactive with no :4041 listener; guarded start allowed",
                result.stdout,
            )

    def test_deliberate_red_promotion_requires_host_owned_account_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_home = pathlib.Path(tmp) / "home"
            result = subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
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
        fleet = (ROOT / "scripts/hermes/install-gem-fleet-controller.sh").read_text(
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
        self.assertIn("scripts/hermes/systemd/symphony-elixir.service", fleet)
        self.assertNotIn("scripts/hermes/systemd/symphony-ui-pilot.service", fleet)
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
                ["bash", str(ROOT / "scripts/hermes/update-symphony-burrito.sh"), "--runtime-readback"],
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
                            str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
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
