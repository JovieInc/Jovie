"""Host provider settings must never leak into the lane pytest suite (JOV-8578).

PR #22144's first affected-coverage run inherited live provider configuration
from a configured lanes host and failed eight existing account/lease fixtures;
its isolated rerun excluded LANES_/SYMPHONY_/CODEX_LANE_/CLAUDE_LANE_/HYPERAGENT_
by hand. scripts/tests/conftest.py is the durable isolation point, but its scrub
list lagged the provider knobs the lane modules bind at import time
(CODEX_ACCOUNTS_ROOT/CODEX_LEASE_*/CODEX_HOME in codex_lane.py,
CLAUDE_LANE_* in claude_lane.py, HYPERAGENT_LANE_ATTESTATION in
hyperagent_lane.py). These tests pin the conftest scrub to every
provider-specific setting the lane modules consume: a behavioral subprocess
proof against the real conftest, a scan over the env reads in scripts/lanes, and
a sync contract with lane_runner.selftest_env's HOST_KNOB_PREFIXES.

Run with:
    python3 -m pytest scripts/tests/test_conftest_host_isolation.py -v
"""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFTEST = ROOT / "scripts/tests/conftest.py"
LANES_DIR = ROOT / "scripts/lanes"
LANE_RUNNER = LANES_DIR / "lane_runner.py"

# Provider-specific host settings the lane modules bind at import time. A
# configured lanes host exports these; a leaked value re-points accounts/lease
# state or quota banks at live provider accounts mid-suite (PR #22144).
PROVIDER_SETTINGS = {
    "CODEX_ACCOUNTS_ROOT": "/live/codex-accounts",
    "CODEX_API_KEY": "sk-live-fixture",
    "CODEX_DEFAULT_COOLDOWN_S": "9",
    "CODEX_HOME": "/live/codex",
    "CODEX_LEASE_POLL_S": "1",
    "CODEX_LEASE_WAIT_S": "1",
    "CODEX_METADATA_TIMEOUT_S": "9",
    "CODEX_RATE_BACKOFF_S": "9",
    "CODEX_ROTATE_PAUSE_S": "9",
    "CODEX_LANE_AUTH_MODE": "current-login",
    "CODEX_LEDGER_DIR": "/live/ledger",
    "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-live-fixture",
    "CLAUDE_LANE_BURST_BACKOFF_S": "9",
    "CLAUDE_LANE_DEFAULT_BANK_S": "9",
    "CLAUDE_LANE_ENV": "/live/claude.env",
    "CLAUDE_LANE_WINDOW_S": "9",
    "HYPERAGENT_LANE_ATTESTATION": "/live/attestation",
    # Host lane tuning the scrub already covered: guards the fixture itself.
    "LANES_STATE": "/live/state",
    "SYMPHONY_FILE_OVERLAP_GUARD": "flag",
}

# Provider-specific setting families a lane module may consume. Host lane
# tuning (LANES_/SYMPHONY_) is scrubbed today; the conftest must cover these
# families so a future provider knob cannot silently leak again.
PROVIDER_PREFIX_CLASSES = ("CODEX_", "CLAUDE_", "HYPERAGENT_", "LANES_", "SYMPHONY_")

_ENV_NAME = re.compile(r"""environ(?:\.get)?\[?\(?["']([A-Z][A-Z0-9_]*)["']|getenv\(["']([A-Z][A-Z0-9_]*)["']""")


def _assign_str_tuple(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return tuple(elt.value for elt in node.value.elts)
    return None


def _conftest_tree():
    return ast.parse(CONFTEST.read_text(encoding="utf-8"), filename=str(CONFTEST))


def _conftest_scrub_prefixes():
    prefixes = _assign_str_tuple(_conftest_tree(), "_SCRUB_PREFIXES")
    if prefixes is None:
        raise AssertionError("scripts/tests/conftest.py no longer defines _SCRUB_PREFIXES")
    return prefixes


def _scrub_covers(key, prefixes, exact):
    return key in exact or any(key.startswith(prefix) for prefix in prefixes)


class ConftestHostIsolationTest(unittest.TestCase):
    def test_conftest_scrubs_provider_host_settings(self):
        """Behavioral proof: after the real conftest runs, no provider setting survives.

        Executes conftest.py in a child interpreter with host-shaped provider
        settings seeded, then reports which seeds survived the scrub.
        """
        probe = (
            "import json, os, runpy, sys\n"
            "runpy.run_path(sys.argv[1], run_name='conftest_under_test')\n"
            "seeded = json.loads(sys.argv[2])\n"
            "print(json.dumps(sorted(k for k in seeded if k in os.environ)))\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", probe, str(CONFTEST), json.dumps(sorted(PROVIDER_SETTINGS))],
            capture_output=True, text=True, timeout=120,
            env={**os.environ, **PROVIDER_SETTINGS}, cwd=str(ROOT),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        survivors = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(survivors, [],
                         "host provider settings survived the scripts/tests/conftest.py scrub")

    def test_lane_module_provider_env_reads_are_scrub_covered(self):
        """Every provider-family env read in scripts/lanes must be scrub-covered.

        Scans the lane modules for os.environ/os.getenv reads and requires the
        conftest scrub (prefix or exact) to cover each provider-family name, so
        a new provider knob cannot silently bypass the isolation.
        """
        prefixes = _conftest_scrub_prefixes()
        exact = _assign_str_tuple(_conftest_tree(), "_SCRUB_EXACT") or ()
        leaked = []
        for module in sorted(LANES_DIR.glob("*.py")):
            source = module.read_text(encoding="utf-8")
            for match in _ENV_NAME.finditer(source):
                name = match.group(1) or match.group(2)
                if name.startswith(PROVIDER_PREFIX_CLASSES) and not _scrub_covers(name, prefixes, exact):
                    leaked.append(f"{module.name}:{name}")
        self.assertEqual(leaked, [],
                         "provider-specific env reads not covered by the conftest scrub")

    def test_conftest_scrub_covers_lane_runner_host_knob_prefixes(self):
        """Sync contract: conftest scrub covers lane_runner.selftest_env knob prefixes.

        lane_runner.selftest_env is the release self-test isolation surface; its
        HOST_KNOB_PREFIXES are the lane-tuning prefixes the host injects. The
        pytest conftest must never cover less, or the suite is less hermetic
        than the release self-test.
        """
        knobs = _assign_str_tuple(
            ast.parse(LANE_RUNNER.read_text(encoding="utf-8"), filename=str(LANE_RUNNER)),
            "HOST_KNOB_PREFIXES",
        )
        self.assertIsNotNone(knobs, "lane_runner.py no longer defines HOST_KNOB_PREFIXES")
        prefixes = _conftest_scrub_prefixes()
        uncovered = [knob for knob in knobs if not any(knob.startswith(prefix) for prefix in prefixes)]
        self.assertEqual(uncovered, [],
                         "lane_runner HOST_KNOB_PREFIXES not covered by the conftest scrub")


if __name__ == "__main__":
    unittest.main()
