#!/usr/bin/env python3

from __future__ import annotations

import fcntl
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
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
        self.assertIn("codex app-server capacity unavailable", result.stderr)
        self.assertIn("CLI-only providers remain isolated", result.stderr)
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
