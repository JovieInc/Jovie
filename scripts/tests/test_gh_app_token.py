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
            self.assertIn("gh_app_token.py", shim)
            self.assertIn("exec /usr/bin/gh", shim)
            self.assertIn("[ \"$1\" = gist ] && exec /usr/bin/gh", shim, "gists keep the host login")
            self.assertIn('"$GH_HOST" != github.com ] && exec /usr/bin/gh', shim,
                          "a non-github.com GH_HOST keeps the caller's credentials")
            self.assertTrue(os.environ["PATH"].startswith(str(shim_dir)))

    def test_no_key_and_no_env_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = os.environ.get("PATH")
            lane.load_github_env(Path(tmp) / "missing.env", Path(tmp) / "none.pem", Path(tmp) / "bin")
            self.assertEqual(os.environ.get("PATH"), before)


if __name__ == "__main__":
    unittest.main()
