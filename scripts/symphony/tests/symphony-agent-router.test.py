#!/usr/bin/env python3

from __future__ import annotations

import json
import fcntl
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
        (self.home / ".config/symphony/linear.env").write_text("LINEAR_API_KEY=test-only\n")

    def executable(self, name: str, body: str) -> pathlib.Path:
        path = self.root / name
        path.write_text("#!/bin/sh\nset -eu\n" + body)
        path.chmod(0o755)
        return path

    def environment(
        self,
        guard: pathlib.Path,
        cursor: pathlib.Path,
        adapter: pathlib.Path,
        probe: pathlib.Path | None = None,
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
            "SYMPHONY_CURSOR_EXECUTABLE": str(cursor),
            "SYMPHONY_CURSOR_ADAPTER": str(adapter),
            "SYMPHONY_AUTO_ROUTE": str(auto_route),
            "SYMPHONY_CODEX_ROUTER": str(codex),
            "CODEX_ACCOUNTS_STATE": str(state),
        }

    def assert_headless_arguments(self, provider: str, opt_in: str | None) -> None:
        guard = self.executable("guard", "exit 0\n" if provider == "codex" else "exit 75\n")
        cursor = self.executable(
            "cursor",
            'case "$1" in status) echo "Logged in";; models) echo "gpt-5.6-luna-high";; esac\n',
        )
        capture = self.executable("capture", 'printf "%s\\n" "$@"\n')
        env = self.environment(guard, cursor, capture)
        # Deliberately isolate the inherited host environment from this opt-in.
        env.pop("SYMPHONY_CODEX_DISABLE_APPS", None)
        if opt_in is not None:
            env["SYMPHONY_CODEX_DISABLE_APPS"] = opt_in
        env["SYMPHONY_CODEX_ROUTER"] = str(capture)
        env["PS4"] = '+${LINENO}: '
        self.write_route()
        arguments = ["app-server", "--config", 'model="gpt-5.6-sol"']
        result = subprocess.run(
            ["bash", "-x", str(ROUTER), *arguments], cwd=self.workspace,
            env=env, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = (["--disable", "apps"] if provider == "codex" and opt_in == "1" else []) + arguments
        self.assertEqual(result.stdout.splitlines(), expected)
        injection_line = next(
            n for n, line in enumerate(ROUTER.read_text().splitlines(), 1)
            if 'set -- --disable apps "$@"' in line
        )
        trace = f"+{injection_line}: set -- --disable apps app-server"
        if provider == "codex" and opt_in == "1":
            self.assertIn(trace, result.stderr)
        else:
            self.assertNotIn(trace, result.stderr)
        receipt = json.loads((self.home / ".local/state/symphony-provider-router/JOV-5954.json").read_text())
        self.assertEqual(receipt["provider"], provider)

    def test_headless_codex_disables_apps_with_real_argv_and_changed_line_execution(self):
        self.assert_headless_arguments("codex", "1")

    def test_headless_cursor_never_receives_codex_flags(self):
        self.assert_headless_arguments("cursor", "1")

    def test_default_codex_keeps_existing_arguments(self):
        self.assert_headless_arguments("codex", None)

    def test_disabled_opt_in_keeps_existing_codex_arguments(self):
        self.assert_headless_arguments("codex", "0")

    def write_route(self, model: str = "gpt-5.6-sol") -> None:
        (self.workspace / ".symphony-routing.json").write_text(
            json.dumps({"schema": "symphony-routing/v1", "issue": "JOV-5954", "model": model})
        )

    def assert_direct_owner_blocks_provider(self, guard_status):
        probes = self.root / "probe-called"
        guard = self.executable("guard", f'touch "{probes}"\nexit {guard_status}\n')
        cursor = self.executable("cursor", f'touch "{probes}"\necho "Logged in"\n')
        adapter = self.executable("adapter", "echo forbidden-start\n")
        env = self.environment(guard, cursor, adapter)
        lease = self.home / ".local/state/symphony-fallback/leases/JOV-5954.lock"
        lease.parent.mkdir(parents=True)
        with lease.open("a+") as owner:
            fcntl.flock(owner, fcntl.LOCK_EX)
            inode = os.fstat(owner.fileno()).st_ino
            result = subprocess.run([str(ROUTER), "app-server"], cwd=self.workspace, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertFalse(probes.exists(), result.stdout)
            self.assertEqual(lease.stat().st_ino, inode)

    def test_direct_owner_blocks_codex_before_account_probe(self):
        self.assert_direct_owner_blocks_provider(0)

    def test_direct_owner_blocks_cursor_before_provider_probe(self):
        self.assert_direct_owner_blocks_provider(75)

    def test_forged_inherited_claim_cannot_start_provider(self):
        guard = self.executable("guard", "exit 0\n")
        cursor = self.executable("cursor", "exit 0\n")
        adapter = self.executable("adapter", "echo forbidden-start\n")
        env = {**self.environment(guard, cursor, adapter), "SYMPHONY_ISSUE_LEASE_FD": "9"}
        result = subprocess.run([str(ROUTER), "app-server"], cwd=self.workspace, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertIn("class=issue-lease-busy", result.stderr)

    def test_actual_codex_handoff_inherits_claim_and_uses_workspace_registry(self):
        guard = self.executable("guard", "exit 0\n")
        cursor = self.executable("cursor", "exit 1\n")
        adapter = self.executable("adapter", "exit 1\n")
        env = self.environment(guard, cursor, adapter)
        config = self.workspace / "scripts/symphony/config"
        config.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts/symphony/config/model-registry.json", config / "model-registry.json")
        self.write_route()
        exhausted = self.root / "exhausted.py"
        exhausted.write_text('import sys\nassert sys.argv[1:] == ["pickup-check", "JOV-5954"]\n')
        rotate = self.root / "rotate"
        rotate.write_text('''#!/usr/bin/env python3
import fcntl, os, pathlib, sys
path = pathlib.Path(os.environ["SYMPHONY_FALLBACK_LEASE_DIR"]) / "JOV-5954.lock"
with path.open("a+") as challenger:
    try:
        fcntl.flock(challenger, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("CLAIM_HELD " + " ".join(sys.argv[1:]))
    else:
        raise SystemExit("issue claim lost across exec")
''')
        rotate.chmod(0o755)
        env.update({"SYMPHONY_CODEX_ROUTER": str(ROOT / "scripts/symphony/symphony-codex-router"),
                    "SYMPHONY_CODEX_EXHAUSTED": str(exhausted), "SYMPHONY_CODEX_ROTATE": str(rotate),
                    "SYMPHONY_ROUTER_HEARTBEAT_SECONDS": "0"})
        result = subprocess.run([str(ROUTER), "app-server"], cwd=self.workspace, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('CLAIM_HELD --config shell_environment_policy.inherit=all --config model="gpt-5.6-sol" app-server', result.stdout)
        self.assertEqual((self.workspace / "scripts/symphony/symphony-codex-router").read_bytes(),
                         (ROOT / "scripts/symphony/symphony-codex-router").read_bytes())

    def test_exhausted_codex_uses_eligible_cursor_in_same_launch(self) -> None:
        guard = self.executable("guard", "exit 75\n")
        cursor = self.executable(
            "cursor",
            "case \"${1:-}\" in status) echo 'Logged in' ;; models) echo 'gpt-5.6-luna-high - ready' ;; esac\n",
        )
        adapter = self.executable("adapter", "echo cursor-started\n")
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor, adapter),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "cursor-started")
        receipt = json.loads(
            (self.home / ".local/state/symphony-provider-router/JOV-5954.json").read_text()
        )
        self.assertEqual(receipt["provider"], "cursor")
        self.assertEqual(receipt["reason"], "eligible-primary-provider")

    def test_ready_codex_is_preferred_without_requerying_linear(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        cursor = self.executable(
            "cursor",
            "case \"${1:-}\" in status) echo 'Logged in' ;; models) echo 'gpt-5.6-luna-high - ready' ;; esac\n",
        )
        adapter = self.executable("adapter", "echo cursor-started\n")
        self.write_route()
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor, adapter),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")

    def test_stale_cooldown_is_revalidated_before_provider_fallback(self) -> None:
        guard_calls = self.root / "guard-calls"
        guard = self.executable(
            "guard",
            f"count=$(wc -l < '{guard_calls}' 2>/dev/null || echo 0)\n"
            f"echo call >> '{guard_calls}'\n"
            '[ "$count" -ge 1 ]\n',
        )
        probe_calls = self.root / "probe-calls"
        probe = self.executable("probe", f"echo call >> '{probe_calls}'\n")
        cursor = self.executable("cursor", "echo must-not-run; exit 9\n")
        adapter = self.executable("adapter", "echo must-not-run; exit 9\n")
        self.write_route()

        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor, adapter, probe),
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
        cursor = self.executable("cursor", "echo must-not-run; exit 9\n")
        adapter = self.executable("adapter", "echo must-not-run; exit 9\n")
        self.write_route()

        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor, adapter, probe),
            text=True,
            capture_output=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")
        self.assertFalse(probe_calls.exists())

    def test_unavailable_cursor_uses_ready_codex(self) -> None:
        guard = self.executable("guard", "exit 0\n")
        cursor = self.executable("cursor", "exit 1\n")
        adapter = self.executable("adapter", "exit 9\n")
        self.write_route()
        result = subprocess.run(
            [str(ROUTER), "app-server"], cwd=self.workspace,
            env=self.environment(guard, cursor, adapter), text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "codex-started")

    def test_model_inventory_requires_exact_id(self) -> None:
        guard = self.executable("guard", "exit 75\n")
        cursor = self.executable(
            "cursor",
            "case \"${1:-}\" in status) echo 'Logged in' ;; models) echo 'gpt-5.6-luna-high - ready' ;; esac\n",
        )
        adapter = self.executable("adapter", "echo must-not-run; exit 9\n")
        env = self.environment(guard, cursor, adapter)
        env["SYMPHONY_CURSOR_MODEL"] = "gpt-5.6-luna"
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertEqual(result.stdout, "")
        cooldowns = json.loads(
            (self.home / ".local/state/symphony-provider-router/provider-cooldowns.json").read_text()
        )
        self.assertEqual(
            cooldowns["providers"]["cursor"]["reason"],
            "authenticated-capacity-probe-failed",
        )

    def test_all_providers_unavailable_exits_once_with_retryable_capacity(self) -> None:
        guard = self.executable("guard", "exit 75\n")
        cursor_calls = self.root / "cursor-calls"
        cursor = self.executable(
            "cursor",
            f"echo call >> '{cursor_calls}'\nexit 1\n",
        )
        adapter = self.executable("adapter", "echo must-not-run; exit 9\n")
        env = self.environment(guard, cursor, adapter)
        results = [
            subprocess.run(
                [str(ROUTER), "app-server"],
                cwd=self.workspace,
                env=env,
                text=True,
                capture_output=True,
            )
            for _ in range(2)
        ]
        for result in results:
            self.assertEqual(result.returncode, 75)
            self.assertEqual(result.stdout, "")
            self.assertIn("retryable=true", result.stderr)
            self.assertNotIn("must-not-run", result.stdout)
        self.assertEqual(cursor_calls.read_text().splitlines(), ["call"])
        cooldowns = json.loads(
            (self.home / ".local/state/symphony-provider-router/provider-cooldowns.json").read_text()
        )
        self.assertEqual(
            cooldowns["providers"]["cursor"]["reason"],
            "authenticated-capacity-probe-failed",
        )

    def test_corrupt_cooldown_state_requires_reconciliation(self) -> None:
        guard = self.executable("guard", "exit 75\n")
        cursor = self.executable("cursor", "exit 1\n")
        adapter = self.executable("adapter", "exit 9\n")
        cooldowns = self.home / ".local/state/symphony-provider-router/provider-cooldowns.json"
        cooldowns.parent.mkdir(parents=True, exist_ok=True)
        cooldowns.write_text("{not-json\n")
        result = subprocess.run(
            [str(ROUTER), "app-server"],
            cwd=self.workspace,
            env=self.environment(guard, cursor, adapter),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 75)
        self.assertIn("CAPACITY_RECONCILE_REQUIRED", result.stderr)
        self.assertEqual(cooldowns.read_text(), "{not-json\n")


if __name__ == "__main__":
    unittest.main()
