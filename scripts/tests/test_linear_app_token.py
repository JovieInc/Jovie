"""Lanes use the Jovie Lanes Linear app's own quota instead of Tim's user budget (2026-10-11)."""
from __future__ import annotations

import base64
import importlib.util
import io
import json
import os
import stat
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from email.message import EmailMessage
from pathlib import Path
from unittest import mock

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")
spec = importlib.util.spec_from_file_location("lane_runner", LANES / "lane_runner.py")
lane = importlib.util.module_from_spec(spec)
sys.modules.setdefault("lane_runner", lane)
spec.loader.exec_module(lane)
import linear_app_token as app  # noqa: E402


class Handle:
    def __init__(self, payload, headers=None):
        self.raw, self.headers = json.dumps(payload).encode(), headers or EmailMessage()

    def read(self):
        return self.raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class AppTokenTest(unittest.TestCase):
    def setUp(self):
        self.state = Path(tempfile.mkdtemp())
        self.mints = []

    def fake_mint(self, lifetime=30 * 86400):
        def mint(client_id, secret):
            self.mints.append((client_id, secret))
            return f"tok-{len(self.mints)}", lifetime
        return mint

    def test_scope_is_one_constant_and_the_mint_request_uses_exactly_it(self):
        # Linear revokes every existing app token when a mint asks for other scopes.
        self.assertEqual(app.SCOPE, "read,write,issues:create,comments:create")
        seen = []

        def urlopen(request, timeout):
            seen.append(request)
            return Handle({"access_token": "fresh", "token_type": "Bearer", "expires_in": 2591999})
        with mock.patch.object(app.urllib.request, "urlopen", urlopen):
            self.assertEqual(app.mint("cid", "sec"), ("fresh", 2591999.0))
        [request] = seen
        self.assertEqual(request.full_url, app.TOKEN_URL)
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(urllib.parse.parse_qs(request.data.decode()),
                         {"grant_type": ["client_credentials"], "scope": [app.SCOPE]})
        self.assertEqual(request.get_header("Authorization"), "Basic " + base64.b64encode(b"cid:sec").decode())
        with mock.patch.object(app.urllib.request, "urlopen", lambda request, timeout: Handle({"token_type": "bearer"})):
            with self.assertRaises(ValueError):
                app.mint("cid", "sec")

    def test_one_cached_private_token_per_host_until_near_expiry(self):
        first = app.token("cid", "sec", self.state, now=1000, mint_fn=self.fake_mint())
        again = app.token("cid", "sec", self.state, now=2000, mint_fn=self.fake_mint())
        self.assertEqual((first, again, len(self.mints)), ("tok-1", "tok-1", 1))
        cache = self.state / app.CACHE_NAME
        self.assertEqual(stat.S_IMODE(cache.stat().st_mode), 0o600)
        record = json.loads(cache.read_text())
        self.assertEqual((record["scope"], record["expiresAt"]), (app.SCOPE, 1000 + 30 * 86400))
        self.assertNotIn("cid", cache.read_text())  # identity is a digest, not the client id
        view = app.status(self.state, now=2000)
        self.assertNotIn("tok-1", json.dumps(view))
        # Inside the renewal margin a new token is minted once.
        near = 1000 + 30 * 86400 - app.RENEW_MARGIN_S
        self.assertEqual(app.token("cid", "sec", self.state, now=near, mint_fn=self.fake_mint()), "tok-2")
        # Another app's credentials never reuse this cache.
        self.assertEqual(app.token("other", "sec", self.state, now=near, mint_fn=self.fake_mint()), "tok-3")

    def test_a_rejected_token_is_replaced_once_or_by_a_sibling(self):
        app.token("cid", "sec", self.state, now=1000, mint_fn=self.fake_mint())
        self.assertEqual(app.token("cid", "sec", self.state, rejected="tok-1", now=1001,
                                   mint_fn=self.fake_mint()), "tok-2")
        # A worker still holding tok-1 sees the sibling's tok-2 without another mint.
        self.assertEqual(app.token("cid", "sec", self.state, rejected="tok-1", now=1002,
                                   mint_fn=self.fake_mint()), "tok-2")
        self.assertEqual(len(self.mints), 2)

    def test_a_failed_mint_backs_off_instead_of_retrying_per_request(self):
        def broken(client_id, secret):
            self.mints.append(client_id)
            raise urllib.error.URLError("down")
        with self.assertRaises(app.TokenUnavailable) as raised:
            app.token("cid", "sec", self.state, now=1000, mint_fn=broken)
        self.assertEqual(raised.exception.retry_at, 1000 + app.MINT_BACKOFF_S)
        with self.assertRaises(app.TokenUnavailable):
            app.token("cid", "sec", self.state, now=1100, mint_fn=broken)
        self.assertEqual(len(self.mints), 1)
        self.assertEqual(app.token("cid", "sec", self.state, now=1000 + app.MINT_BACKOFF_S,
                                   mint_fn=self.fake_mint()), "tok-2")

    def test_selftest_never_reads_the_host_credentials(self):
        with mock.patch.dict(os.environ, {"LANES_SELFTEST": "1"}):
            os.environ.pop("LANES_LINEAR_APP_ENV", None)
            self.assertIsNone(app.default_path())
        with mock.patch.dict(os.environ, {"LANES_LINEAR_APP_ENV": "/x/linear-app.env"}):
            self.assertEqual(app.default_path(), Path("/x/linear-app.env"))


class LinearClientAppModeTest(unittest.TestCase):
    def setUp(self):
        self.state = Path(tempfile.mkdtemp())
        patcher = mock.patch.dict(os.environ, {"LANES_STATE": str(self.state)})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.legacy = self.state / "linear.env"
        self.legacy.write_text('LINEAR_API_KEY="lin_api_personal"\n')
        self.app_env = self.state / "linear-app.env"
        self.app_env.write_text('LINEAR_CLIENT_ID="cid"\nexport LINEAR_CLIENT_SECRET=sec\n')

    def test_only_the_app_credential_is_used_and_a_missing_one_fails_closed(self):
        # Tim 2026-10-20: no personal-key fallback, so Tim's key can be revoked safely.
        client = lane.Linear(self.legacy, app_env=self.app_env)
        self.assertEqual(client.key, "linear-app:cid")
        with mock.patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("no request")):
            for missing in (self.state / "missing.env", None):
                with self.subTest(missing=missing), \
                        mock.patch.object(app, "default_path", return_value=missing):
                    with self.assertRaises(lane.LinearAppCredentialMissing) as raised:
                        lane.Linear(self.legacy, app_env=missing) if missing else lane.Linear(self.legacy)
                    self.assertNotIn("lin_api_personal", str(raised.exception))
            incomplete = self.state / "incomplete.env"
            incomplete.write_text("LINEAR_CLIENT_ID=cid\n")
            with self.assertRaises(lane.LinearAppCredentialMissing):
                lane.Linear(self.legacy, app_env=incomplete)
            self.assertTrue(issubclass(lane.LinearAppCredentialMissing, Exception),
                            "doctor/watchdog `except Exception` sites must degrade, not exit")
            bare = lane.Linear.__new__(lane.Linear)
            with self.assertRaises(lane.LinearAppCredentialMissing):
                bare._authorization()

    def test_requests_carry_the_bearer_token_and_a_401_re_mints_once(self):
        client = lane.Linear(self.legacy, app_env=self.app_env)
        tokens = iter(["tok-a", "tok-b"])
        seen = []
        headers = EmailMessage()
        headers["X-RateLimit-Requests-Remaining"] = "4990"
        headers["X-RateLimit-Requests-Limit"] = "5000"
        headers["X-Complexity"] = "12"

        def urlopen(request, timeout):
            seen.append(request.get_header("Authorization"))
            if len(seen) == 1:
                raise urllib.error.HTTPError(request.full_url, 401, "unauthorized", EmailMessage(), io.BytesIO(b""))
            return Handle({"data": {"viewer": {"name": "Jovie Lanes"}}}, headers)
        with mock.patch.object(app, "mint", lambda cid, secret: (next(tokens), 30 * 86400)), \
                mock.patch.object(lane.urllib.request, "urlopen", urlopen):
            self.assertEqual(client.gql("query{viewer{name}}", {})["viewer"]["name"], "Jovie Lanes")
        self.assertEqual(seen, ["Bearer tok-a", "Bearer tok-b"])
        budget = json.loads((self.state / "api-budget.json").read_text())
        self.assertEqual((budget["remaining"], budget["limit"]), (4990, 5000))
        usage = json.loads((self.state / "linear-usage.json").read_text())
        rows = [family for window in usage["windows"].values() for scope in window.values()
                for family in scope["lane-runner"].values()]
        self.assertEqual(sum(row["complexityConsumed"] or 0 for row in rows), 12)
        self.assertNotIn("tok-", (self.state / "linear-usage.json").read_text())

    def test_an_unavailable_token_is_a_cooldown_not_a_failed_request(self):
        client = lane.Linear(self.legacy, app_env=self.app_env)
        with mock.patch.object(app, "mint", side_effect=OSError("down")), \
                mock.patch.object(lane.urllib.request, "urlopen", side_effect=AssertionError("no request")):
            with self.assertRaises(lane.LinearRateLimited):
                client.gql("query{viewer{id}}", {})

    def test_endpoint_reset_header_extends_the_cooldown(self):
        headers = EmailMessage()
        headers["X-RateLimit-Requests-Reset"] = "1000000"
        headers["X-RateLimit-Endpoint-Requests-Reset"] = "2000000"
        self.assertEqual(lane._hinted_reset_s(headers, 0), 2000000)


if __name__ == "__main__":
    unittest.main()
