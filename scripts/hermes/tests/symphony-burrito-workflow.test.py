#!/usr/bin/env python3

from __future__ import annotations

import os
import pathlib
import re
import subprocess
import tempfile
import unittest
import importlib.util
import json
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / "scripts/hermes/symphony/WORKFLOW.md"
WORKFLOW = WORKFLOW_PATH.read_text(encoding="utf-8")
UNIT_PATH = ROOT / "scripts/hermes/systemd/symphony-elixir.service"
UNIT = UNIT_PATH.read_text(encoding="utf-8")
UPDATER = (ROOT / "scripts/hermes/update-symphony-burrito.sh").read_text(encoding="utf-8")
HELPER_PATH = ROOT / "scripts/hermes/symphony_official_runtime.py"
LIVE_SLUG = "symphony-ui-pilot-96d6b9c5b2d5"
TOKEN_RE = re.compile(r"lin_(?:api_|oauth_)?[A-Za-z0-9]{12,}|api_key:\s*(?!\$LINEAR_API_KEY\b)\S+")


def _load_helper():
    spec = importlib.util.spec_from_file_location("symphony_official_runtime", HELPER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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
        self.assertIn(f'project_slug: "{LIVE_SLUG}"', WORKFLOW)
        self.assertNotIn("jovie-ba6736cbfbb9", WORKFLOW)
        self.assertIn("root: ~/symphony-elixir-workspaces", WORKFLOW)
        self.assertIn("timeout_ms: 900000", WORKFLOW)
        self.assertIn("max_concurrent_agents: 40", WORKFLOW)
        self.assertIn("api_key: $LINEAR_API_KEY", WORKFLOW)
        self.assertIn("required_labels:", WORKFLOW)
        self.assertIn("    - symphony", WORKFLOW)
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
        self.assertNotIn("- Merging", WORKFLOW)
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
        )
        self.assertTrue(result["ok"], result)
        budget = result["budget"]
        self.assertEqual(budget["pagesPerPoll"], 3)
        self.assertEqual(budget["schedulerRequestsPerHour"], 360)
        self.assertLessEqual(budget["steadyStateRequestsPerHour"], 2500)

    def test_budget_fails_for_five_second_polling_or_unbounded_concurrency(self):
        helper = _load_helper()
        unsafe_interval = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=5000, max_concurrent_agents=40)
        )
        self.assertFalse(unsafe_interval["withinBudget"])
        self.assertEqual(unsafe_interval["schedulerRequestsPerHour"], 2160)
        safe = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=30000, max_concurrent_agents=40)
        )
        self.assertTrue(safe["withinBudget"], safe)
        self.assertEqual(safe["schedulerRequestsPerHour"], 360)
        unsafe_concurrency = helper.compute_budget(
            helper.BudgetInputs(poll_interval_ms=30000, max_concurrent_agents=80)
        )
        self.assertFalse(unsafe_concurrency["withinBudget"])

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
        self.assertIsNone(malformed_retry_after["retryAfterSeconds"])
        self.assertIsNone(malformed_retry_after["resetAt"])
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

    def test_updater_dry_run_and_config_copy_refuse_obsolete_shape(self):
        self.assertIn("linux_x86_64", UPDATER)
        self.assertIn('SYMPHONY_VERSION="${SYMPHONY_VERSION:-v0.0.2}"', UPDATER)
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
        dry = subprocess.run(
            ["bash", str(updater), "--dry-run", "--no-restart"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertIn("SERVICE symphony-elixir.service", dry.stdout)
        self.assertIn("PORT 4041", dry.stdout)
        self.assertIn("BUDGET_OK", dry.stdout)
        self.assertIn("UNTOUCHED symphony-lyb.service http://127.0.0.1:4042/api/v1/state", dry.stdout)
        self.assertNotIn("4043", dry.stdout)
        obsolete = subprocess.run(
            ["bash", str(updater), "--dry-run", "--no-restart"],
            cwd=ROOT,
            env={**os.environ, "SYMPHONY_SERVICE_NAME": "symphony-burrito.service"},
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
                **os.environ,
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
            self.assertIn(LIVE_SLUG, existing.read_text())
            unit = pathlib.Path(tmp) / "home/.config/systemd/user/symphony-elixir.service"
            helper = pathlib.Path(tmp) / "home/.local/bin/symphony-official-runtime"
            self.assertTrue(unit.is_file())
            self.assertTrue(helper.is_file())
            self.assertFalse((pathlib.Path(tmp) / "home/.config/systemd/user/symphony-burrito.service").exists())
            existing.write_text(
                existing.read_text().replace(
                    "max_concurrent_agents: 40", "max_concurrent_agents: 20"
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
        promotion_guard = UPDATER.index("  assert_no_active_agents_interrupted\n")
        account_guard = UPDATER.index("assert_account_environment_ready\n")
        first_install = UPDATER.index('install_one "$HELPER_SRC" "$HELPER_DST" 0755')
        retirement = UPDATER.index("  retire_legacy_units\n")
        restart = UPDATER.index(
            '  systemctl --user restart "$SERVICE_NAME"', retirement
        )
        self.assertLess(promotion_guard, first_install)
        self.assertLess(account_guard, first_install)
        self.assertNotIn('> "$ACCOUNT_ENV"', UPDATER)
        self.assertNotIn('install_one "$ACCOUNT_ENV"', UPDATER)
        self.assertLess(retirement, restart)
        self.assertIn('systemctl --user mask --now "${LEGACY_UNITS[@]}"', UPDATER)
        for unit in (
            "symphony-ui-pilot.service",
            "symphony-reconciler.service",
            "symphony-grok-sidecar.service",
            "symphony-reconciler.timer",
            "symphony-grok-sidecar.timer",
            "symphony-burrito.service",
            "symphony-burrito-update.service",
            "symphony-burrito-update.timer",
        ):
            self.assertIn(unit, UPDATER)
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
            target_home = pathlib.Path(tmp) / "home"
            account_home = target_home / ".codex-accounts/meetjovie"
            account_home.mkdir(parents=True)
            account_env = target_home / ".config/symphony/codex-account.env"
            account_env.parent.mkdir(parents=True)
            account_env.write_text(f"CODEX_HOME={account_home}\n")
            account_env.chmod(0o600)
            result = subprocess.run(
                [
                    "bash",
                    str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
                    "--skip-binary",
                ],
                cwd=ROOT,
                env={
                    **os.environ,
                    "SYMPHONY_ELIXIR_HOME": str(target_home),
                    "SYMPHONY_STATE_URL": "http://127.0.0.1:9/api/v1/state",
                },
                capture_output=True,
                text=True,
            )
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
                    str(ROOT / "scripts/hermes/update-symphony-burrito.sh"),
                    "--skip-binary",
                    "--no-restart",
                ],
                cwd=ROOT,
                env={**os.environ, "SYMPHONY_ELIXIR_HOME": str(target_home)},
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
            "update-symphony-burrito.sh --skip-binary --no-restart --retire-legacy",
            activation,
        )
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
        updater = ROOT / "scripts/hermes/update-symphony-burrito.sh"
        with tempfile.TemporaryDirectory() as tmp:
            fake_bin = pathlib.Path(tmp) / "bin"
            fake_bin.mkdir()
            (fake_bin / "systemctl").write_text(
                "#!/usr/bin/env bash\n"
                "if [ \"$1\" = --user ] && [ \"$2\" = is-active ]; then exit 0; fi\n"
                "echo unexpected systemctl \"$@\" >&2\n"
                "exit 9\n"
            )
            (fake_bin / "curl").write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' '{\"running\":[{\"issue_identifier\":\"JOV-1\"}],\"retrying\":[],\"blocked\":[]}'\n"
            )
            os.chmod(fake_bin / "systemctl", 0o755)
            os.chmod(fake_bin / "curl", 0o755)
            env = {
                **os.environ,
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "SYMPHONY_BURRITO_HOME": str(pathlib.Path(tmp) / "home"),
            }
            result = subprocess.run(
                ["bash", str(updater), "--skip-binary"],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 75)
            self.assertIn("RESTART_REFUSED_ACTIVE_LEASES", result.stderr)


if __name__ == "__main__":
    unittest.main()
