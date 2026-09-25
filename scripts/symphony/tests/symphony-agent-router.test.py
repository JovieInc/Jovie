#!/usr/bin/env python3

from __future__ import annotations

import fcntl
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
ROUTER = ROOT / "scripts/symphony/symphony-agent-router"


class SymphonyAgentRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.home = self.root / "home"
        self.workspace = self.root / "JOV-5954"
        self.workspace.mkdir(parents=True)
        (self.home / ".config/symphony").mkdir(parents=True)
        (self.home / ".config/symphony/linear.env").write_text(
            "LINEAR_API_KEY=test-only\n"
        )

    def executable(self, name: str, body: str) -> pathlib.Path:
        path = self.root / name
        path.write_text("#!/bin/sh\nset -eu\n" + body)
        path.chmod(0o755)
        return path

    def environment(
        self,
        guard: pathlib.Path,
        *,
        probe: pathlib.Path | None = None,
        cursor: pathlib.Path | None = None,
        adapter: pathlib.Path | None = None,
    ) -> dict[str, str]:
        controller = self.home / ".local/bin/symphony-codex-exhausted.py"
        controller.parent.mkdir(parents=True, exist_ok=True)
        controller.write_text("import sys\nassert sys.argv[1:3] == ['native-preflight', 'JOV-5954']\n")
        auto_route = self.root / "auto-route.mjs"
        auto_route.write_text("#!/usr/bin/env node\nprocess.exit(0);\n")
        auto_route.chmod(0o755)
        codex = self.executable("codex-router", "echo codex-started\n")
        state = self.home / ".codex-accounts/state.json"
        state.parent.mkdir(parents=True)
        state.write_text("{}\n")
        return {
            **os.environ,
            "SYMPHONY_HOME": str(self.home),
            "SYMPHONY_ROUTER_HEARTBEAT_SECONDS": "0",
            "SYMPHONY_WORKSPACE": str(self.workspace),
            "SYMPHONY_ISSUE_IDENTIFIER": "JOV-5954",
            "SYMPHONY_CAPACITY_GUARD": str(guard),
            "SYMPHONY_CODEX_ACCOUNT_PROBE": str(
                probe or self.executable("probe", "exit 75\n")
            ),
            # These spies prove CLI-only providers remain outside this launcher.
            "SYMPHONY_CURSOR_EXECUTABLE": str(
                cursor or self.executable("cursor", "exit 99\n")
            ),
            "SYMPHONY_CURSOR_ADAPTER": str(
                adapter or self.executable("adapter", "exit 99\n")
            ),
            "SYMPHONY_AUTO_ROUTE": str(auto_route),
            "SYMPHONY_CODEX_ROUTER": str(codex),
            "CODEX_ACCOUNTS_STATE": str(state),
        }

    def test_native_admission_refuses_before_any_provider_probe(self):
        calls = self.root / "provider-called"
        guard = self.executable("guard", f'touch "{calls}"\nexit 0\n')
        env = self.environment(guard)
        controller = self.home / ".local/bin/symphony-codex-exhausted.py"
        for installed in (False, True):
            if installed:
                controller.parent.mkdir(parents=True, exist_ok=True)
                controller.write_text("raise SystemExit(75)\n")
            else:
                controller.unlink(missing_ok=True)
            result = subprocess.run(["bash", str(ROUTER), "app-server"], cwd=self.workspace,
                                    env=env, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertFalse(calls.exists())

    def test_native_preflight_keeps_initialize_stream_alive_without_provider(self):
        calls = self.root / "provider-called"
        guard = self.executable("guard", f'touch "{calls}"\nexit 0\n')
        env = self.environment(guard)
        env["SYMPHONY_ROUTER_HEARTBEAT_SECONDS"] = "1"
        controller = self.home / ".local/bin/symphony-codex-exhausted.py"
        controller.write_text("import time\ntime.sleep(2.1)\nraise SystemExit(75)\n")
        result = subprocess.run(["bash", str(ROUTER), "app-server"], cwd=self.workspace,
                                env=env, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 75)
        self.assertFalse(calls.exists())
        messages = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertGreaterEqual(len(messages), 1)
        self.assertTrue(all(row["method"] == "symphony-router/preflight" for row in messages))

    def write_route(self, model: str = "gpt-5.6-sol") -> None:
        (self.workspace / ".symphony-routing.json").write_text(
            json.dumps(
                {
                    "schema": "symphony-routing/v1",
                    "issue": "JOV-5954",
                    "model": model,
                }
            )
        )

    def assert_headless_arguments(self, opt_in: str | None) -> None:
        guard = self.executable("guard", "exit 0\n")
        capture = self.executable("capture", 'printf "%s\\n" "$@"\n')
        env = self.environment(guard)
        env.pop("SYMPHONY_CODEX_DISABLE_APPS", None)
        if opt_in is not None:
            env["SYMPHONY_CODEX_DISABLE_APPS"] = opt_in
        env["SYMPHONY_CODEX_ROUTER"] = str(capture)
        env["PS4"] = r"+${LINENO}: "
        self.write_route()
        arguments = ["app-server", "--config", 'model="gpt-5.6-sol"']
        result = subprocess.run(
            ["bash", "-x", str(ROUTER), *arguments],
            cwd=self.workspace,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = (["--disable", "apps"] if opt_in == "1" else []) + arguments
        self.assertEqual(result.stdout.splitlines(), expected)
        injection_line = next(
            number
            for number, line in enumerate(ROUTER.read_text().splitlines(), 1)
            if 'set -- --disable apps "$@"' in line
        )
        trace = f"+{injection_line}: set -- --disable apps app-server"
        if opt_in == "1":
            self.assertIn(trace, result.stderr)
        else:
            self.assertNotIn(trace, result.stderr)
        receipt = json.loads(
            (
                self.home
                / ".local/state/symphony-provider-router/JOV-5954.json"
            ).read_text()
        )
        self.assertEqual(receipt["provider"], "codex")

    def test_headless_codex_disables_apps_with_real_argv_and_changed_line_execution(self):
        self.assert_headless_arguments("1")

    def test_default_codex_keeps_existing_arguments(self):
        self.assert_headless_arguments(None)

    def test_disabled_opt_in_keeps_existing_codex_arguments(self):
        self.assert_headless_arguments("0")

    def test_direct_owner_blocks_before_any_provider_probe(self):
        probes = self.root / "probe-called"
        guard = self.executable("guard", f'touch "{probes}"\nexit 0\n')
        cursor = self.executable("cursor", f'touch "{probes}"\nexit 0\n')
        adapter = self.executable("adapter", f'touch "{probes}"\nexit 0\n')
        env = self.environment(guard, cursor=cursor, adapter=adapter)
        lease = (
            self.home
            / ".local/state/symphony-fallback/leases/JOV-5954.lock"
        )
        lease.parent.mkdir(parents=True)
        with lease.open("a+") as owner:
            fcntl.flock(owner, fcntl.LOCK_EX)
            inode = os.fstat(owner.fileno()).st_ino
            result = subprocess.run(
                [str(ROUTER), "app-server"],
                cwd=self.workspace,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertFalse(probes.exists(), result.stdout)
            self.assertEqual(lease.stat().st_ino, inode)

    def test_forged_inherited_claim_cannot_start_codex(self):
        guard = self.executable("guard", "exit 0\n")
        env = {
            **self.environment(guard),
            "SYMPHONY_ISSUE_LEASE_FD": "9",
        }
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertIn("class=issue-lease-busy", result.stderr)

    def test_actual_codex_handoff_inherits_claim_and_uses_workspace_registry(self):
        guard = self.executable("guard", "exit 0\n")
        env = self.environment(guard)
        config = self.workspace / "scripts/symphony/config"
        config.mkdir(parents=True)
        shutil.copyfile(
            ROOT / "scripts/symphony/config/model-registry.json",
            config / "model-registry.json",
        )
        self.write_route()
        exhausted = self.root / "exhausted.py"
        exhausted.write_text(
            'import sys\nassert sys.argv[1:] == ["pickup-check", "JOV-5954"]\n'
        )
        rotate = self.root / "rotate"
        rotate.write_text(
            '''#!/usr/bin/env python3
import fcntl, os, pathlib, sys
path = pathlib.Path(os.environ["SYMPHONY_FALLBACK_LEASE_DIR"]) / "JOV-5954.lock"
with path.open("a+") as challenger:
    try:
        fcntl.flock(challenger, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("CLAIM_HELD " + " ".join(sys.argv[1:]))
    else:
        raise SystemExit("issue claim lost across exec")
'''
        )
        rotate.chmod(0o755)
        env.update(
            {
                "SYMPHONY_CODEX_ROUTER": str(
                    ROOT / "scripts/symphony/symphony-codex-router"
                ),
                "SYMPHONY_CODEX_EXHAUSTED": str(exhausted),
                "SYMPHONY_CODEX_ROTATE": str(rotate),
                "SYMPHONY_ROUTER_HEARTBEAT_SECONDS": "0",
            }
        )
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(
            'CLAIM_HELD --config shell_environment_policy.inherit=all --config model="gpt-5.6-sol" app-server',
            result.stdout,
        )

    def test_actual_codex_handoff_preserves_pickup_refusal_status(self):
        guard = self.executable("guard", "exit 0\n")
        env = self.environment(guard)
        self.write_route()
        codex_router = ROOT / "scripts/symphony/symphony-codex-router"
        traced_router = self.executable(
            "traced-router", f'exec bash -x "{codex_router}" "$@"\n'
        )
        exhausted = self.root / "exhausted.py"
        downstream = self.root / "rotate-called"
        rotate = self.executable("rotate", f'touch "{downstream}"\n')
        env.update({
            "SYMPHONY_CODEX_ROUTER": str(traced_router),
            "SYMPHONY_CODEX_EXHAUSTED": str(exhausted),
            "SYMPHONY_CODEX_ROTATE": str(rotate),
            "SYMPHONY_ROUTER_HEARTBEAT_SECONDS": "0",
            "PS4": r"+${LINENO}: ",
        })
        pickup_line = next(
            number
            for number, line in enumerate(codex_router.read_text().splitlines(), 1)
            if 'python3 "$EXHAUSTED" pickup-check "$issue"' in line
        )
        for status, retryable in ((75, "true"), (78, "false")):
            with self.subTest(status=status):
                diagnostic = (
                    "SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 "
                    f"class=pickup-refused retryable={retryable}"
                )
                exhausted.write_text(
                    'import sys\nassert sys.argv[1:] == ["pickup-check", "JOV-5954"]\n'
                    f"print({diagnostic!r}, file=sys.stderr)\nraise SystemExit({status})\n"
                )
                result = subprocess.run(
                    [str(ROUTER), "app-server"], cwd=self.workspace, env=env,
                    capture_output=True, text=True, timeout=10,
                )
                self.assertEqual(result.returncode, status, result.stderr)
                self.assertIn(diagnostic, result.stderr)
                self.assertIn(f"+{pickup_line}: exit {status}", result.stderr)
                self.assertFalse(downstream.exists(), result.stdout)
                self.assertEqual(result.stdout, "")

    def test_cli_only_cursor_cannot_enter_official_app_server(self) -> None:
        calls = self.root / "cli-only-provider-called"
        guard = self.executable("guard", "exit 75\n")
        cursor = self.executable("cursor", f'touch "{calls}"\nexit 0\n')
        adapter = self.executable("adapter", f'touch "{calls}"\nexit 0\n')
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor=cursor, adapter=adapter),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr.strip(), (
            "codex-rotate: CAPACITY_UNAVAILABLE schema=symphony-provider-capacity/v1 "
            "class=provider-capacity retryable=true reason=app_server_capacity_unavailable "
            "retryAt=unknown waitSeconds=unknown"
        ))
        self.assertFalse(calls.exists())
        self.assertFalse(
            (
                self.home
                / ".local/state/symphony-provider-router/JOV-5954.json"
            ).exists()
        )

    def test_stale_codex_capacity_is_revalidated_before_retryable_exit(self) -> None:
        guard_calls = self.root / "guard-calls"
        guard = self.executable(
            "guard",
            f"count=$(wc -l < '{guard_calls}' 2>/dev/null || echo 0)\n"
            f"echo call >> '{guard_calls}'\n"
            '[ "$count" -ge 1 ]\n',
        )
        probe_calls = self.root / "probe-calls"
        probe = self.executable("probe", f"echo call >> '{probe_calls}'\n")
        self.write_route()
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, probe=probe),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertEqual(probe_calls.read_text().splitlines(), ["call"])
        self.assertEqual(guard_calls.read_text().splitlines(), ["call", "call"])

    def age_capacity_state(self, seconds: int = 600) -> pathlib.Path:
        state = pathlib.Path(self.environment_state)
        stamp = time.time() - seconds
        os.utime(state, (stamp, stamp))
        return state

    def install_route_prep_stubs(
        self,
        env: dict[str, str],
        *,
        probe_body: str,
        require_fresh_state: bool = True,
    ) -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
        probe_calls = self.root / "probe-calls"
        probe = self.executable("probe", probe_body)
        key_seen = self.root / "auto-route-key"
        state = env["CODEX_ACCOUNTS_STATE"]
        freshness = (
            "const age = Date.now() - statSync(process.env.CODEX_ACCOUNTS_STATE).mtimeMs;\n"
            "if (!(age >= 0 && age <= 5 * 60 * 1000)) process.exit(78);\n"
            if require_fresh_state
            else ""
        )
        auto_route = pathlib.Path(env["SYMPHONY_AUTO_ROUTE"])
        auto_route.write_text(
            "#!/usr/bin/env node\n"
            "import { writeFileSync, statSync } from 'node:fs';\n"
            f"writeFileSync({json.dumps(str(key_seen))}, process.env.LINEAR_API_KEY || '');\n"
            "if (!process.env.LINEAR_API_KEY) process.exit(78);\n"
            + freshness
            + "writeFileSync(process.env.SYMPHONY_WORKSPACE + '/.symphony-routing.json', JSON.stringify({\n"
            "  schema: 'symphony-routing/v1',\n"
            "  issue: 'JOV-5954',\n"
            "  model: 'gpt-5.6-sol',\n"
            "}) + '\\n');\n"
            "process.stdout.write('ROUTE_ADMITTED schema=symphony-routing/v1 issue=JOV-5954 model=gpt-5.6-sol source=created-receipt\\n');\n"
        )
        env["SYMPHONY_CODEX_ACCOUNT_PROBE"] = str(probe)
        env.pop("LINEAR_API_KEY", None)
        return probe_calls, key_seen, pathlib.Path(state)

    def test_new_issue_refreshes_stale_capacity_and_keeps_the_linear_key_out_of_the_agent(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        env = self.environment(guard)
        self.environment_state = env["CODEX_ACCOUNTS_STATE"]
        state = self.age_capacity_state()
        before = state.stat().st_mtime
        probe_calls, key_seen, _state = self.install_route_prep_stubs(
            env,
            probe_body=(
                'printf "%s\\n" "${CODEX_ACCOUNT_PROBE_MODE:-}" >> "$PROBE_CALLS"\n'
                '[ "${CODEX_ACCOUNT_PROBE_MODE:-}" = "refresh-freshness" ]\n'
                'python3 - "$CODEX_ACCOUNTS_STATE" <<\'PY\'\n'
                "import pathlib, sys\n"
                "path = pathlib.Path(sys.argv[1])\n"
                "path.write_text(path.read_text())\n"
                "PY\n"
            ),
        )
        env["PROBE_CALLS"] = str(probe_calls)
        config = self.workspace / "scripts/symphony/config"
        config.mkdir(parents=True)
        shutil.copyfile(
            ROOT / "scripts/symphony/config/model-registry.json",
            config / "model-registry.json",
        )
        key_file = self.root / "agent-saw-key"
        rotate = self.root / "rotate"
        rotate.write_text(
            "#!/usr/bin/env python3\n"
            "import os, pathlib\n"
            f"pathlib.Path({json.dumps(str(key_file))}).write_text('yes' if os.environ.get('LINEAR_API_KEY') else 'no')\n"
            "print('codex-started')\n"
        )
        rotate.chmod(0o755)
        exhausted = self.root / "exhausted.py"
        exhausted.write_text(
            'import sys\nassert sys.argv[1:] == ["pickup-check", "JOV-5954"]\n'
        )
        env.update({
            "SYMPHONY_CODEX_ROUTER": str(ROOT / "scripts/symphony/symphony-codex-router"),
            "SYMPHONY_CODEX_EXHAUSTED": str(exhausted),
            "SYMPHONY_CODEX_ROTATE": str(rotate),
        })
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertNotIn("ROUTE_ADMITTED", result.stdout)
        self.assertIn(
            "ROUTE_ADMITTED schema=symphony-routing/v1 issue=JOV-5954 model=gpt-5.6-sol source=created-receipt",
            result.stderr,
        )
        self.assertNotIn("test-only", result.stdout + result.stderr)
        self.assertEqual(probe_calls.read_text().splitlines(), ["refresh-freshness"])
        self.assertGreater(state.stat().st_mtime, before)
        self.assertEqual(key_seen.read_text(), "test-only")
        self.assertEqual(key_file.read_text(), "no")

    def test_stale_capacity_refresh_failure_does_not_launch_or_rewrite_state(self) -> None:
        calls = self.root / "auto-route-called"
        guard = self.executable("guard", "exit 0\n")
        env = self.environment(guard)
        self.environment_state = env["CODEX_ACCOUNTS_STATE"]
        state = self.age_capacity_state()
        before = state.read_bytes()
        probe_calls = self.root / "probe-calls"
        probe = self.executable(
            "probe",
            f'printf "%s\\n" "${{CODEX_ACCOUNT_PROBE_MODE:-}}" >> "{probe_calls}"\nexit 75\n',
        )
        auto_route = pathlib.Path(env["SYMPHONY_AUTO_ROUTE"])
        auto_route.write_text(
            "#!/usr/bin/env node\n"
            "import { writeFileSync } from 'node:fs';\n"
            f"writeFileSync({json.dumps(str(calls))}, 'called');\n"
            "process.exit(0);\n"
        )
        env["SYMPHONY_CODEX_ACCOUNT_PROBE"] = str(probe)
        env.pop("LINEAR_API_KEY", None)
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertEqual(result.stderr.strip(), (
            "codex-rotate: CAPACITY_UNAVAILABLE schema=symphony-provider-capacity/v1 "
            "class=provider-capacity retryable=true reason=app_server_capacity_unavailable "
            "retryAt=unknown waitSeconds=unknown"
        ))
        self.assertEqual(probe_calls.read_text().splitlines(), ["refresh-freshness"])
        self.assertFalse(calls.exists())
        self.assertEqual(state.read_bytes(), before)
        self.assertFalse((self.workspace / ".symphony-routing.json").exists())
        self.assertNotIn("test-only", result.stdout + result.stderr)

    def test_missing_linear_key_fails_closed_before_a_capacity_refresh(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        for label, contents in (("missing", None), ("empty", "LINEAR_API_KEY=\n")):
            with self.subTest(label=label):
                accounts = self.home / ".codex-accounts"
                if accounts.exists():
                    shutil.rmtree(accounts)
                env = self.environment(guard)
                self.environment_state = env["CODEX_ACCOUNTS_STATE"]
                self.age_capacity_state()
                probe_calls = self.root / f"probe-calls-{label}"
                probe = self.executable(
                    f"probe-{label}",
                    f'printf "called\\n" >> "{probe_calls}"\nexit 0\n',
                )
                calls = self.root / f"auto-route-{label}"
                auto_route = pathlib.Path(env["SYMPHONY_AUTO_ROUTE"])
                auto_route.write_text(
                    "#!/usr/bin/env node\n"
                    "import { writeFileSync } from 'node:fs';\n"
                    f"writeFileSync({json.dumps(str(calls))}, 'called');\n"
                )
                env["SYMPHONY_CODEX_ACCOUNT_PROBE"] = str(probe)
                env.pop("LINEAR_API_KEY", None)
                linear_env = self.home / ".config/symphony/linear.env"
                if contents is None:
                    linear_env.unlink()
                else:
                    linear_env.write_text(contents)
                result = subprocess.run(
                    [str(ROUTER), "app-server"],
                    cwd=self.workspace,
                    env=env,
                    text=True,
                    capture_output=True,
                    timeout=10,
                )
                self.assertEqual(result.returncode, 75, result.stderr)
                self.assertFalse(probe_calls.exists())
                self.assertFalse(calls.exists())
                self.assertNotIn("test-only", result.stdout + result.stderr)

    def test_fresh_capacity_skips_refresh_for_a_new_issue(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        env = self.environment(guard)
        self.environment_state = env["CODEX_ACCOUNTS_STATE"]
        probe_calls, key_seen, _state = self.install_route_prep_stubs(env, probe_body="exit 75\n")
        codex = self.executable("capture", 'printf "codex-started\\n"\n')
        env["SYMPHONY_CODEX_ROUTER"] = str(codex)
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertIn("ROUTE_ADMITTED schema=symphony-routing/v1", result.stderr)
        self.assertFalse(probe_calls.exists())
        self.assertEqual(key_seen.read_text(), "test-only")

    def test_saved_route_does_not_refresh_stale_capacity(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        probe_calls = self.root / "probe-calls"
        probe = self.executable("probe", f'printf "called\\n" >> "{probe_calls}"\n')
        env = self.environment(guard, probe=probe)
        self.environment_state = env["CODEX_ACCOUNTS_STATE"]
        self.age_capacity_state()
        self.write_route()
        env.pop("LINEAR_API_KEY", None)
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertFalse(probe_calls.exists())

    def test_ready_codex_does_not_spend_a_recovery_probe(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        probe_calls = self.root / "probe-calls"
        probe = self.executable("probe", f"echo call >> '{probe_calls}'\n")
        self.write_route()
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, probe=probe),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertFalse(probe_calls.exists())


if __name__ == "__main__":
    unittest.main()
