"""Policy tests for scripts/lanes/worktree_hosts.py (JOV-10172): which hosts may
create lane worktrees, and the fallback cap. Pure functions; no git needed except
the injected counter.

Run with:
    python3 -m unittest scripts/tests/test_worktree_hosts.py -v
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("worktree_hosts", ROOT / "scripts/lanes/worktree_hosts.py")
policy = importlib.util.module_from_spec(SPEC)
sys.modules["worktree_hosts"] = policy
SPEC.loader.exec_module(policy)


def worktree_list(count):
    """A fake `git worktree list --porcelain` result with `count` linked worktrees."""
    blocks = ["worktree /repo\nHEAD abc\nbranch refs/heads/main"]
    blocks += [f"worktree /state/worktrees/run{i}\nHEAD {'d' * 40}\ndetached" for i in range(count)]
    return SimpleNamespace(returncode=0, stdout="\n\n".join(blocks) + "\n", stderr="")


class HostPolicyTest(unittest.TestCase):
    def test_default_is_gem_only_and_fail_closed(self):
        for raw in (None, "", "   ", ",", " , "):
            with self.subTest(raw=raw):
                environ = {} if raw is None else {policy.HOSTS_ENV: raw}
                self.assertEqual(policy.hosts(environ), ["gem"])
        self.assertEqual(policy.role("mac", {}), "not-owner")
        self.assertFalse(policy.allowed("mac", {}))
        self.assertFalse(policy.allowed("tims-macbook-pro.local", {}))

    def test_primary_and_fallback_roles_with_case_and_domain_tolerance(self):
        environ = {policy.HOSTS_ENV: "gem, tims-macbook-pro.local, air"}
        self.assertEqual(policy.hosts(environ), ["gem", "tims-macbook-pro", "air"])
        self.assertEqual(policy.role("gem", environ), "primary")
        self.assertEqual(policy.role("GEM.example.com", environ), "primary")
        self.assertEqual(policy.role("Tims-MacBook-Pro", environ), "fallback")
        self.assertEqual(policy.role("air", environ), "fallback")
        self.assertEqual(policy.role("mac", environ), "not-owner")
        self.assertEqual(policy.hosts({policy.HOSTS_ENV: "gem,gem, mac"}), ["gem", "mac"])

    def test_cap_applies_to_fallback_hosts_only(self):
        environ = {policy.HOSTS_ENV: "gem,mac", policy.MAX_WORKTREES_ENV: "5"}
        self.assertIsNone(policy.max_worktrees("gem", environ))
        self.assertIsNone(policy.max_worktrees("elsewhere", environ))
        self.assertEqual(policy.max_worktrees("mac", environ), 5)
        self.assertEqual(policy.max_worktrees("mac", {policy.HOSTS_ENV: "gem,mac"}), policy.DEFAULT_MAX_WORKTREES)
        for bad in ("0", "-2", "nan", ""):
            with self.subTest(bad=bad):
                self.assertEqual(policy.max_worktrees(
                    "mac", {policy.HOSTS_ENV: "gem,mac", policy.MAX_WORKTREES_ENV: bad}),
                    policy.DEFAULT_MAX_WORKTREES)

    def test_remote_only_lanes_spawn_anywhere(self):
        environ = {}
        for spec in ({"repairs": False}, {"remote": True}, {"remote": True, "repairs": False}):
            with self.subTest(spec=spec):
                self.assertTrue(policy.spawn_allowed("mac", spec, environ))
        for spec in ({}, {"repairs": True}, {"remote": False}, {"enabled": False}):
            with self.subTest(spec=spec):
                self.assertTrue(policy.spawn_allowed("gem", spec, environ))
                self.assertFalse(policy.spawn_allowed("mac", spec, environ))

    def test_count_worktrees_reads_linked_entries_only(self):
        self.assertEqual(policy.count_worktrees("/repo", lambda a, **k: worktree_list(3)), 3)
        self.assertEqual(policy.count_worktrees("/repo", lambda a, **k: worktree_list(0)), 0)

    def test_count_worktrees_fails_closed_on_git_trouble(self):
        for fake in (lambda a, **k: SimpleNamespace(returncode=128, stdout="", stderr="boom"),
                     lambda a, **k: SimpleNamespace(returncode=0, stdout="", stderr=""),
                     lambda a, **k: (_ for _ in ()).throw(OSError("gone"))):
            with self.subTest(fake=fake):
                self.assertIsNone(policy.count_worktrees("/repo", fake))

    def test_admission_reasons(self):
        # The primary host is always admitted; the count is never read.
        calls = []
        self.assertIsNone(policy.admission("gem", "/repo", lambda a, **k: calls.append(a) or worktree_list(9),
                                           {policy.HOSTS_ENV: "gem,mac"}))
        self.assertEqual(calls, [])
        environ = {policy.HOSTS_ENV: "gem,mac", policy.MAX_WORKTREES_ENV: "2"}
        self.assertIsNone(policy.admission("mac", "/repo", lambda a, **k: worktree_list(1), environ))
        self.assertEqual(policy.admission("mac", "/repo", lambda a, **k: worktree_list(2), environ),
                         "worktree-cap:2/2")
        self.assertEqual(policy.admission("mac", "/repo",
                                          lambda a, **k: SimpleNamespace(returncode=1, stdout="", stderr=""),
                                          environ), "worktree-count-unavailable")
        self.assertEqual(policy.admission("mac", "/repo", lambda a, **k: worktree_list(0), {}),
                         "worktree-host-not-allowed:mac")
        self.assertEqual(policy.admission("", "/repo", lambda a, **k: worktree_list(0), {}),
                         "worktree-host-not-allowed:unknown")

    def test_selftest_environments_run_as_primary_off_gem(self):
        # CI and the release self-test execute the lane suite on arbitrary hostnames.
        for environ in ({"LANES_SELFTEST": "1"}, {"LANES_EXECUTION_BACKEND": "local-test"}):
            with self.subTest(environ=environ):
                self.assertEqual(policy.role("ci-runner-7", environ), "primary")
                self.assertTrue(policy.allowed("ci-runner-7", environ))
                self.assertIsNone(policy.max_worktrees("ci-runner-7", environ))
                self.assertIsNone(policy.admission("ci-runner-7", "/repo", lambda a, **k: worktree_list(99),
                                                   environ))

    def test_status_row_shape(self):
        environ = {policy.HOSTS_ENV: "gem,mac", policy.MAX_WORKTREES_ENV: "2"}
        self.assertEqual(policy.status("gem", "/repo", lambda a, **k: worktree_list(4), environ),
                         {"host": "gem", "role": "primary", "hosts": ["gem", "mac"]})
        self.assertEqual(policy.status("Mac.local", "/repo", lambda a, **k: worktree_list(1), environ),
                         {"host": "mac", "role": "fallback", "hosts": ["gem", "mac"],
                          "maxWorktrees": 2, "worktrees": 1})
        self.assertEqual(policy.status("air", "/repo", lambda a, **k: worktree_list(1), environ)["role"],
                         "not-owner")


if __name__ == "__main__":
    unittest.main()
