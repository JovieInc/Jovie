"""Gem lanes use their own Jovie Bot identity instead of Tim's shared GitHub token (JOV-6878)."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")
spec = importlib.util.spec_from_file_location("lane_runner", LANES / "lane_runner.py")
lane = importlib.util.module_from_spec(spec)
sys.modules.setdefault("lane_runner", lane)
spec.loader.exec_module(lane)
import gh_app_token as app  # noqa: E402


class AppTokenTest(unittest.TestCase):
    def test_jwt_is_rs256_signed_for_the_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = Path(tmp) / "k.pem"
            subprocess.run(["openssl", "genrsa", "-out", str(key), "2048"], check=True, capture_output=True)
            with mock.patch.object(app, "KEY", key):
                head, body, sig = app.app_jwt(1_000_000).split(".")
            claims = json.loads(app.base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
            self.assertEqual(claims["iss"], app.APP_ID)
            self.assertLessEqual(claims["exp"] - claims["iat"], 600)  # GitHub caps app JWTs at 10 min
            self.assertTrue(sig)

    def test_a_fresh_cached_token_is_reused_without_a_network_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "t.json"
            cache.write_text(json.dumps({"token": "ghs_cached", "expiresAt": int(time.time()) + 3600}))
            with mock.patch.object(app, "CACHE", cache), mock.patch.object(app.urllib.request, "urlopen") as net:
                self.assertEqual(app.token(), "ghs_cached")
                net.assert_not_called()


class SharedBudgetTest(unittest.TestCase):
    """JOV-7587: polling on every lanes host yields below one shared GraphQL floor."""
    NOW = 1_791_000_000.0

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        patcher = mock.patch.object(app, "BUDGET", Path(tmp.name) / "github-budget.json")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.reads = 0

    def limit(self, remaining, reset_in=1800):
        def fetch():
            self.reads += 1
            return {"remaining": remaining,
                    "resetAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.NOW + reset_in))}
        return fetch

    def test_polls_are_classified_and_writes_never_wait(self):
        polls = [["pr", "list"], ["pr", "view", "1"], ["api", "repos/o/r/pulls"], ["search", "prs"],
                 ["api", "graphql", "-f", "query={repository{id}}"]]
        writes = [["pr", "merge", "1"], ["pr", "comment", "1", "-b", "x"], ["api", "repos/o/r/pulls", "-f", "title=t"],
                  ["api", "-X", "DELETE", "repos/o/r/labels/x"], ["api", "graphql", "-f", "query=mutation{x}"],
                  ["api", "graphql", "-f", app.BUDGET_QUERY], ["gist", "edit"], []]
        self.assertTrue(all(app.is_poll(args) for args in polls))
        self.assertFalse(any(app.is_poll(args) for args in writes))

    def test_polling_holds_below_the_floor_until_reset_and_reads_once_a_minute(self):
        low = self.limit(app.FLOOR - 1)
        self.assertIn("github-budget-floor", app.hold(["pr", "list"], "t", self.NOW, low))
        self.assertIsNone(app.hold(["pr", "merge", "1"], "t", self.NOW, low))
        self.assertIn("github-budget-floor", app.hold(["pr", "view", "2"], "t", self.NOW + 30, low))
        self.assertEqual(self.reads, 1, "one budget read per minute is shared by every call")
        self.assertIsNone(app.hold(["pr", "list"], "t", self.NOW + 1801, low), "the reset releases polling")

    def test_healthy_or_unreadable_budget_never_blocks(self):
        self.assertIsNone(app.hold(["pr", "list"], "t", self.NOW, self.limit(4000)))
        def broken():
            raise OSError("offline")
        self.assertIsNone(app.hold(["pr", "list"], "t", self.NOW + 120, broken))


class GithubEnvTest(unittest.TestCase):
    def setUp(self):
        self.env = dict(os.environ)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.env)

    def test_explicit_host_token_wins_over_the_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / "github.env"
            env.write_text("export GH_TOKEN=ghp_host\n")
            key = Path(tmp) / "k.pem"
            key.write_text("x")
            lane.load_github_env(env, key, Path(tmp) / "bin")
            self.assertEqual(os.environ["GH_TOKEN"], "ghp_host")
            self.assertFalse((Path(tmp) / "bin" / "gh").exists())

    def test_app_key_installs_a_gh_shim_first_on_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = Path(tmp) / "k.pem"
            key.write_text("x")
            shim_dir = Path(tmp) / "bin"
            with mock.patch.object(lane.shutil, "which", return_value="/usr/bin/gh"):
                lane.load_github_env(Path(tmp) / "missing.env", key, shim_dir)
            shim = (shim_dir / "gh").read_text()
            self.assertIn('gh_app_token.py --guard "$@")" || exit $?', shim)
            self.assertIn("exec /usr/bin/gh", shim)
            self.assertIn("[ \"$1\" = gist ] && exec /usr/bin/gh", shim, "gists keep the host login")
            self.assertTrue(os.environ["PATH"].startswith(str(shim_dir)))

    def test_no_key_and_no_env_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = os.environ.get("PATH")
            lane.load_github_env(Path(tmp) / "missing.env", Path(tmp) / "none.pem", Path(tmp) / "bin")
            self.assertEqual(os.environ.get("PATH"), before)


if __name__ == "__main__":
    unittest.main()
