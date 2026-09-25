#!/usr/bin/env python3
"""Grok proof-seat token refresh: live auth, stable identity, dry-run re-enroll."""
from __future__ import annotations

import ast
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import proof_fixtures as F  # noqa: E402
import symphony_proof_context as trust  # noqa: E402
import symphony_useful_turn_probe as PRODUCER  # noqa: E402
import reenroll_grok_proof_seat as reenroll  # noqa: E402

SOURCE = Path(__file__).resolve().parents[1]
WRAPPER_PATH = SOURCE / "symphony-grok-codex-completion"
INSTALLER = SOURCE / "install-symphony-grok-codex-completion.sh"
GROK_CONFIG = 'model = "grok-4.6"\nmodel_provider = "grok"\n'
ACCESS = "test-access-token"
REFRESH = "test-refresh-token"
STALE = "stale-seat-token"


def load_wrapper():
    loader = importlib.machinery.SourceFileLoader("symphony_grok_codex_completion", str(WRAPPER_PATH))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def entry(**overrides) -> dict:
    base = {
        "auth_mode": "oidc",
        "coding_data_retention_opt_out": False,
        "create_time": "2026-09-01T00:00:00Z",
        "email": "seat@example.com",
        "expires_at": "2099-01-01T00:00:00Z",
        "first_name": "Proof",
        "key": ACCESS,
        "last_name": "Seat",
        "oidc_client_id": "client-1",
        "oidc_issuer": "https://auth.x.ai",
        "principal_id": "principal-1",
        "principal_type": "user",
        "refresh_token": REFRESH,
        "team_id": "team-1",
        "user_id": "user-1",
    }
    base.update(overrides)
    return base


def write_live(path: Path, **overrides) -> None:
    path.write_text(json.dumps({"https://auth.x.ai::seat": entry(**overrides)}), encoding="utf-8")
    path.chmod(0o600)


class GrokIdentityTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="grok-proof-seat-"))
        self.account = self.root / "grok"
        self.account.mkdir()
        self.live = self.root / "live-auth.json"
        write_live(self.live)
        (self.account / "config.toml").write_text(GROK_CONFIG, encoding="utf-8")
        (self.account / "auth.json").write_text(
            json.dumps({"https://auth.x.ai::stale": entry(key=STALE, expires_at="2000-01-01T00:00:00Z")}),
            encoding="utf-8",
        )
        self.env = mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(self.live)})
        self.env.start()
        self.now = datetime(2026, 9, 25, 2, 43, 16, tzinfo=timezone.utc)

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.root)

    def test_identity_ignores_rotating_token_fields(self):
        original = trust.profile_identity(self.account)
        write_live(
            self.live,
            key="rotated-access-token",
            refresh_token="rotated-refresh-token",
            expires_at="2099-06-01T00:00:00Z",
            create_time="2026-09-25T06:10:00Z",
            first_name="Changed",
            last_name="Name",
            coding_data_retention_opt_out=True,
        )
        self.assertEqual(trust.profile_identity(self.account), original)
        self.assertNotIn(ACCESS, original)
        self.assertNotIn("rotated-access-token", original)

    def test_identity_changes_for_principal_config_and_account_path(self):
        original = trust.profile_identity(self.account)
        for field, value in (
            ("user_id", "user-2"),
            ("principal_id", "principal-2"),
            ("team_id", "team-2"),
            ("email", "other@example.com"),
            ("oidc_client_id", "client-2"),
            ("auth_mode", "oauth"),
            ("principal_type", "service"),
        ):
            write_live(self.live, **{field: value})
            self.assertNotEqual(trust.profile_identity(self.account), original, field)
            write_live(self.live)
        config = self.account / "config.toml"
        config.write_text(GROK_CONFIG + "approval_policy = \"never\"\n", encoding="utf-8")
        self.assertNotEqual(trust.profile_identity(self.account), original)
        config.write_text(GROK_CONFIG, encoding="utf-8")
        other = self.root / "other-seat"
        other.mkdir()
        (other / "config.toml").write_text(GROK_CONFIG, encoding="utf-8")
        (other / "auth.json").write_text("{}", encoding="utf-8")
        self.assertNotEqual(trust.profile_identity(other), original)

    def test_identity_rejects_symlinks_without_reading_secret_bytes(self):
        target = self.root / "linked-auth.json"
        target.write_text(json.dumps({"key": "symlink-secret"}), encoding="utf-8")
        target.chmod(0o600)
        seat_auth = self.account / "auth.json"
        seat_auth.unlink()
        seat_auth.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlinked account identity") as caught:
            trust.profile_identity(self.account)
        self.assertNotIn("symlink-secret", str(caught.exception))
        seat_auth.unlink()
        (self.account / "auth.json").write_text("{}", encoding="utf-8")

        live_link = self.root / "live-link.json"
        live_link.symlink_to(self.live)
        with mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(live_link)}):
            with self.assertRaisesRegex(ValueError, "symlinked account identity") as caught:
                trust.profile_identity(self.account)
        self.assertNotIn(ACCESS, str(caught.exception))

        linked_account = self.root / "linked-account"
        linked_account.symlink_to(self.account)
        with self.assertRaisesRegex(ValueError, "invalid account path"):
            trust.profile_identity(linked_account)

        config = self.account / "config.toml"
        config.unlink()
        config.symlink_to(self.root / "missing-config")
        with self.assertRaisesRegex(ValueError, "symlinked account identity"):
            trust.profile_identity(self.account)

    def test_permissions_malformed_and_expiry_fail_closed(self):
        self.live.chmod(0o644)
        with self.assertRaisesRegex(trust.GrokAuthError, "untrusted grok auth permissions") as caught:
            trust.profile_identity(self.account)
        self.assertNotIn(ACCESS, str(caught.exception))
        self.live.chmod(0o600)

        self.live.write_text('{"https://auth.x.ai::seat": {"key": "%s",}}\n' % ACCESS, encoding="utf-8")
        self.live.chmod(0o600)
        with self.assertRaisesRegex(trust.GrokAuthError, "malformed grok auth") as caught:
            trust.load_grok_auth_document(self.live)
        self.assertNotIn(ACCESS, str(caught.exception))

        missing = self.root / "absent.json"
        with mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(missing)}):
            with self.assertRaisesRegex(trust.GrokAuthError, "missing grok auth"):
                trust.profile_identity(self.account)

        write_live(self.live, expires_at="not-a-time")
        with self.assertRaisesRegex(trust.GrokAuthError, "malformed grok auth expires_at") as caught:
            trust.grok_access_token(trust.select_xai_oidc_entry(trust.load_grok_auth_document()))
        self.assertNotIn(ACCESS, str(caught.exception))
        write_live(self.live, expires_at="2099-01-01T00:00:00")
        with self.assertRaisesRegex(trust.GrokAuthError, "malformed grok auth expires_at"):
            trust.grok_access_token(trust.select_xai_oidc_entry(trust.load_grok_auth_document()))

        skew = trust.GROK_TOKEN_EXPIRY_SKEW
        inside = (self.now - skew) + timedelta(seconds=1)
        outside = self.now - skew
        write_live(self.live, expires_at=inside.strftime("%Y-%m-%dT%H:%M:%SZ"))
        token = trust.grok_access_token(trust.select_xai_oidc_entry(trust.load_grok_auth_document()), now=self.now)
        self.assertEqual(token, ACCESS)
        write_live(self.live, expires_at=outside.strftime("%Y-%m-%dT%H:%M:%SZ"))
        with self.assertRaisesRegex(trust.GrokAuthError, "grok access token expired") as caught:
            trust.grok_access_token(trust.select_xai_oidc_entry(trust.load_grok_auth_document()), now=self.now)
        self.assertNotIn(ACCESS, str(caught.exception))
        self.assertNotIn(REFRESH, str(caught.exception))

    def test_default_auth_path_is_the_grok_cli_file(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop(trust.GROK_AUTH_ENV, None)
            with mock.patch.object(trust.Path, "home", return_value=self.root):
                self.assertEqual(trust.grok_live_auth_path(), self.root / ".grok" / "auth.json")

    def test_host_config_comments_do_not_disable_live_principal_identity(self):
        (self.account / "config.toml").write_text(
            "# model_provider = \"kimi\"\nmodel = \"grok-4.6\"\nmodel_provider = \"grok\"\n",
            encoding="utf-8",
        )
        original = trust.profile_identity(self.account)
        write_live(self.live, key="rotated-access-token", expires_at="2098-01-01T00:00:00Z")
        self.assertEqual(trust.profile_identity(self.account), original)

    def test_selection_fails_closed_on_ambiguity_and_foreign_issuer(self):
        document = {
            "https://auth.x.ai::one": entry(key="secret-one", user_id="user-1"),
            "https://auth.x.ai::two": entry(key="secret-two", user_id="user-2"),
        }
        with self.assertRaisesRegex(trust.GrokAuthError, "ambiguous xAI auth entries") as caught:
            trust.select_xai_oidc_entry(document)
        self.assertNotIn("secret-one", str(caught.exception))
        self.assertNotIn("secret-two", str(caught.exception))
        foreign = {"https://auth.example::x": entry(oidc_issuer="https://auth.example", key="foreign-secret")}
        with self.assertRaisesRegex(trust.GrokAuthError, "no xAI OIDC auth entry") as caught:
            trust.select_xai_oidc_entry(foreign)
        self.assertNotIn("foreign-secret", str(caught.exception))
        mismatched = {"https://auth.x.ai::seat": entry(oidc_issuer="https://evil.example", key="evil-secret")}
        with self.assertRaisesRegex(trust.GrokAuthError, "no xAI OIDC auth entry") as caught:
            trust.select_xai_oidc_entry(mismatched)
        self.assertNotIn("evil-secret", str(caught.exception))
        with self.assertRaisesRegex(trust.GrokAuthError, "missing xAI auth entries"):
            trust.select_xai_oidc_entry({})
        self.live.write_text(json.dumps(["not-an-object", ACCESS]), encoding="utf-8")
        self.live.chmod(0o600)
        with self.assertRaisesRegex(trust.GrokAuthError, "malformed grok auth") as caught:
            trust.load_grok_auth_document(self.live)
        self.assertNotIn(ACCESS, str(caught.exception))
        with self.assertRaisesRegex(trust.GrokAuthError, "grok auth missing principal") as caught:
            trust.grok_stable_principal({"oidc_issuer": "https://auth.x.ai", "key": ACCESS})
        self.assertNotIn(ACCESS, str(caught.exception))
        with self.assertRaisesRegex(trust.GrokAuthError, "malformed grok principal") as caught:
            trust.grok_stable_principal({**entry(), "email": {"leak": ACCESS}})
        self.assertNotIn(ACCESS, str(caught.exception))
        with self.assertRaisesRegex(trust.GrokAuthError, "grok auth issuer mismatch") as caught:
            trust.grok_stable_principal(entry(oidc_issuer="https://evil.example"))
        self.assertNotIn(ACCESS, str(caught.exception))
        selected = trust.select_xai_oidc_entry({"note": ACCESS, "https://auth.x.ai::seat": entry()})
        self.assertEqual(selected["user_id"], "user-1")
        missing_issuer = trust.select_xai_oidc_entry({"https://auth.x.ai::seat": {"key": ACCESS, "expires_at": "2099-01-01T00:00:00Z"}})
        with self.assertRaisesRegex(trust.GrokAuthError, "grok auth issuer mismatch") as caught:
            trust.grok_stable_principal(missing_issuer)
        self.assertNotIn(ACCESS, str(caught.exception))
        bare = entry()
        del bare["expires_at"]
        with self.assertRaisesRegex(trust.GrokAuthError, "grok auth missing expires_at") as caught:
            trust.grok_access_token(bare)
        self.assertNotIn(ACCESS, str(caught.exception))
        self.assertNotIn(REFRESH, str(caught.exception))
        with self.assertRaisesRegex(trust.GrokAuthError, "no bearer key in grok auth") as caught:
            trust.grok_access_token(entry(key=""))
        self.assertNotIn(REFRESH, str(caught.exception))

    def test_non_grok_seat_still_hashes_the_full_auth_file(self):
        kimi = self.root / "kimi"
        kimi.mkdir()
        (kimi / "config.toml").write_text('model = "k3"\nmodel_provider = "kimi"\n', encoding="utf-8")
        auth = {"key": "kimi-access", "refresh_token": "kimi-refresh", "expires_at": "2000-01-01T00:00:00Z"}
        (kimi / "auth.json").write_text(json.dumps(auth), encoding="utf-8")
        original = trust.profile_identity(kimi)
        auth["expires_at"] = "2099-01-01T00:00:00Z"
        auth["key"] = "kimi-access-rotated"
        (kimi / "auth.json").write_text(json.dumps(auth), encoding="utf-8")
        self.assertNotEqual(trust.profile_identity(kimi), original)
        plain = self.root / "openai"
        plain.mkdir()
        (plain / "auth.json").write_text("{}", encoding="utf-8")
        (plain / "config.toml").write_text('model = "gpt-5.6-sol"\n', encoding="utf-8")
        self.assertEqual(len(trust.profile_identity(plain)), 64)

    def test_validate_account_row_accepts_token_refresh_and_rejects_principal_change(self):
        F.write_private(self.root / "state.json", {"cooldowns": {}, "last_error": {}})
        row = {
            "accountPath": str(self.account),
            "agentProfile": "coder",
            "model": "grok-4.6",
            "profile": trust.profile_identity(self.account),
            "provider": "grok",
        }
        self.assertEqual(trust.validate_account_row(row, self.now)["profile"], row["profile"])
        write_live(self.live, key="rotated-access-token", refresh_token="rotated-refresh", expires_at="2098-01-01T00:00:00Z")
        self.assertEqual(trust.profile_identity(self.account), row["profile"])
        self.assertEqual(trust.validate_account_row(row, self.now)["profile"], row["profile"])
        write_live(self.live, user_id="user-2")
        with self.assertRaisesRegex(ValueError, "enrollment identity mismatch"):
            trust.validate_account_row(row, self.now)


class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="grok-wrapper-"))
        self.home = self.root / "seat"
        self.home.mkdir()
        (self.home / "auth.json").write_text(
            json.dumps({"https://auth.x.ai::stale": entry(key=STALE, expires_at="2000-01-01T00:00:00Z")}),
            encoding="utf-8",
        )
        self.live = self.root / "live-auth.json"
        write_live(self.live)
        self.output = self.root / "out" / "completion.json"
        self.wrapper = load_wrapper()
        self.opener = mock.Mock()
        self.response = mock.Mock()
        self.response.read.return_value = b'{"choices":[{"message":{"content":"```json\\n{\\"ok\\":true}\\n```"}}]}'
        self.response.__enter__ = lambda *args: self.response
        self.response.__exit__ = lambda *args: False
        self.opener.open.return_value = self.response
        self.env = mock.patch.dict(
            os.environ,
            {"SYMPHONY_GROK_AUTH_PATH": str(self.live), "CODEX_HOME": str(self.home)},
        )
        self.env.start()
        self.patched = mock.patch.object(self.wrapper, "completion_opener", return_value=self.opener)
        self.patched.start()

    def tearDown(self):
        self.patched.stop()
        self.env.stop()
        shutil.rmtree(self.root)

    def argv(self, provider: str = "grok", prompt: str = "return json"):
        return [
            "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--json",
            "--model", "grok-4.6", "--config", f'model_provider="{provider}"',
            "--output-last-message", str(self.output), prompt,
        ]

    def test_reads_live_auth_and_strips_fences(self):
        before = self.live.read_bytes()
        self.assertEqual(self.wrapper.main(self.argv()), 0)
        self.assertEqual(self.output.read_text(encoding="utf-8"), '{"ok":true}')
        request = self.opener.open.call_args.args[0]
        self.assertEqual(self.opener.open.call_args.kwargs["timeout"], 45)
        self.assertEqual(request.full_url, "https://api.x.ai/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), f"Bearer {ACCESS}")
        self.assertNotIn(STALE.encode(), request.data)
        body = json.loads(request.data)
        self.assertEqual(body["model"], "grok-4.6")
        self.assertEqual(body["messages"][1]["content"], "return json")
        self.assertEqual(self.live.read_bytes(), before)
        self.assertEqual((self.home / "auth.json").read_text(encoding="utf-8").count(STALE), 1)

    def _assert_closed(self, status: int, phrase: str) -> None:
        stderr = io.StringIO()
        with mock.patch("sys.stderr", stderr):
            code = self.wrapper.main(self.argv())
        text = stderr.getvalue()
        self.assertEqual(code, status, text)
        self.assertIn(phrase, text)
        self.assertNotIn(ACCESS, text)
        self.assertNotIn(REFRESH, text)
        self.assertNotIn(STALE, text)
        self.assertFalse(self.opener.open.called)
        self.assertFalse(self.output.exists())

    def test_fails_closed_without_printing_secrets(self):
        write_live(self.live, expires_at="2000-01-01T00:00:00Z")
        self._assert_closed(1, "grok access token expired")
        self.live.write_text('{"key": "%s"}\n' % ACCESS, encoding="utf-8")
        self.live.chmod(0o600)
        self._assert_closed(1, "no xAI OIDC auth entry")
        self.live.write_text("{not-json %s" % ACCESS, encoding="utf-8")
        self.live.chmod(0o600)
        self._assert_closed(1, "malformed grok auth")
        write_live(self.live)
        self.live.chmod(0o644)
        self._assert_closed(1, "untrusted grok auth permissions")
        missing = self.root / "missing.json"
        with mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(missing)}):
            self._assert_closed(1, "missing grok auth")
        write_live(self.live)
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"CODEX_HOME": str(self.root / "absent")}), mock.patch("sys.stderr", stderr):
            self.assertEqual(self.wrapper.main(self.argv()), 2)
        self.assertIn("CODEX_HOME missing", stderr.getvalue())
        self.assertNotIn(ACCESS, stderr.getvalue())
        self.assertFalse(self.opener.open.called)
        with mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(self.wrapper.main(["nope"]), 2)
        stderr = io.StringIO()
        with mock.patch("sys.stderr", stderr):
            self.assertEqual(self.wrapper.main(self.argv(provider="kimi")), 2)
        self.assertIn("unexpected model_provider", stderr.getvalue())
        self.assertFalse(self.opener.open.called)

    def test_http_error_and_empty_completion_redact_secrets(self):
        write_live(self.live)
        body = json.dumps({"error": ACCESS, "refresh": REFRESH}).encode()
        failure = urllib.error.HTTPError(
            "https://api.x.ai/v1/chat/completions", 403, "forbidden", None, io.BytesIO(body),
        )
        self.opener.open.side_effect = failure
        stderr = io.StringIO()
        with mock.patch("sys.stderr", stderr):
            self.assertEqual(self.wrapper.main(self.argv()), 1)
        text = stderr.getvalue()
        self.assertIn("HTTP 403", text)
        self.assertIn("[redacted]", text)
        self.assertNotIn(ACCESS, text)
        self.assertNotIn(REFRESH, text)
        self.opener.open.side_effect = None
        self.response.read.return_value = b'{"choices":[{"message":{"content":"  "}}]}'
        stderr = io.StringIO()
        with mock.patch("sys.stderr", stderr):
            self.assertEqual(self.wrapper.main(self.argv()), 1)
        self.assertIn("empty completion", stderr.getvalue())
        self.assertIsNone(self.wrapper._NoRedirect().redirect_request(None, None, 302, "moved", None, "https://evil.example"))

    def test_symlink_live_auth_fails_closed(self):
        link = self.root / "live-link.json"
        link.symlink_to(self.live)
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(link)}), mock.patch("sys.stderr", stderr):
            self.assertEqual(self.wrapper.main(self.argv()), 1)
        self.assertIn("symlinked grok auth", stderr.getvalue())
        self.assertNotIn(ACCESS, stderr.getvalue())
        self.assertNotIn(REFRESH, stderr.getvalue())
        self.assertFalse(self.opener.open.called)


class ProbeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="grok-probe-"))
        self.account = self.root / "grok"
        self.account.mkdir()
        self.live = self.root / "live-auth.json"
        write_live(self.live)
        (self.account / "config.toml").write_text(GROK_CONFIG, encoding="utf-8")
        (self.account / "auth.json").write_text("{}", encoding="utf-8")
        F.write_private(self.root / "state.json", {"cooldowns": {}, "last_error": {}})
        self.artifacts = self.root / "attestations"
        self.artifacts.mkdir()
        self.artifacts.chmod(0o700)
        self.env = mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(self.live)})
        self.env.start()
        self.now = datetime.now(timezone.utc)
        self.profile = trust.profile_identity(self.account)
        self.context = self.root / "proof-context.json"
        self.write_context(self.profile)
        self.real_run = subprocess.run

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.root)

    def write_context(self, profile: str) -> None:
        F.write_private(self.context, {
            "accounts": [{
                "accountPath": str(self.account),
                "agentProfile": "coder",
                "model": "grok-4.6",
                "profile": profile,
                "provider": "grok",
            }],
            "attestationDir": str(self.artifacts),
            "binaryPath": str(F.RUNTIME_BINARY),
            "codexPath": str(F.RUNNER),
            "codexSha256": trust.digest(F.RUNNER),
            "observedAt": self.now.isoformat(),
            "runtime": F.RUNTIME,
            "sourceRoot": str(F.SOURCE),
            "workflowPath": str(F.SOURCE / "scripts/symphony/WORKFLOW.md"),
        })

    def fake(self, mutate):
        def run(args, **kwargs):
            if Path(args[0]).name == "git":
                return self.real_run(args, **kwargs)
            self.assertEqual(kwargs["env"]["CODEX_HOME"], str(self.account.resolve()))
            self.assertEqual(kwargs["env"]["JOVIE_AGENT_PROFILE"], "coder")
            self.assertEqual(args[1:7], ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--model", "grok-4.6"])
            self.assertEqual(args[7], "--config")
            self.assertEqual(args[8], 'model_provider="grok"')
            mutate()
            prompt = args[-1]
            numbers = ast.literal_eval(prompt.split("list of ", 1)[1].split(". Return", 1)[0])
            nonce = prompt.split("nonce must be ", 1)[1].rstrip(".")
            output = Path(args[args.index("--output-last-message") + 1])
            output.write_text(json.dumps({"nonce": nonce, "sorted": sorted(numbers), "sum": sum(numbers)}), encoding="utf-8")
            return subprocess.CompletedProcess(args, 0, b"", b"")
        return run

    def test_probe_accepts_token_refresh_and_rejects_principal_mismatch(self):
        loaded = trust.load_context(self.now, self.context)
        self.assertEqual(loaded["accounts"][0]["profile"], self.profile)

        def refresh():
            write_live(self.live, key="rotated-access-token", refresh_token="rotated-refresh", expires_at="2098-01-01T00:00:00Z", create_time="2026-09-25T06:10:00Z")

        with mock.patch.object(subprocess, "run", side_effect=self.fake(refresh)):
            proof = PRODUCER.produce(self.context, self.account, F.RUNNER)
        self.assertEqual(proof["profile"], self.profile)
        self.assertTrue(proof["useful"])
        self.assertEqual(trust.profile_identity(self.account), self.profile)

        write_live(self.live)
        before = set(self.artifacts.iterdir())

        def swap_principal():
            write_live(self.live, user_id="user-2")

        with mock.patch.object(subprocess, "run", side_effect=self.fake(swap_principal)):
            with self.assertRaisesRegex(ValueError, "enrollment identity mismatch|binding or cooldown"):
                PRODUCER.produce(self.context, self.account, F.RUNNER)
        self.assertEqual(before, set(self.artifacts.iterdir()))

        self.write_context("a" * 64)
        with self.assertRaisesRegex(ValueError, "enrollment identity mismatch"):
            PRODUCER.produce(self.context, self.account, F.RUNNER)


class ReenrollTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="grok-reenroll-"))
        self.account = self.root / "grok"
        self.account.mkdir()
        self.live = self.root / "live-auth.json"
        write_live(self.live)
        (self.account / "config.toml").write_text(GROK_CONFIG, encoding="utf-8")
        (self.account / "auth.json").write_text("{}", encoding="utf-8")
        self.codex = self.root / "symphony-grok-codex-completion"
        self.codex.write_text("#!/usr/bin/env python3\nprint('shim')\n", encoding="utf-8")
        self.codex.chmod(0o700)
        self.context = self.root / "proof-context.json"
        self.kimi_profile = "14c6aa5331f271401348ddc07367cf6e5f769d6fcd2f679f8f826061682b535d"
        self.old_profile = "6b023ff9b4b0062b6f0f5f9efd8911b2b2a46ab1df933f6e50569b95017dd57c"
        self.old_sha = "244188b19515bd62b6c3a865d88ec300a1bfe011f3169710fbe5178b81e58013"
        F.write_private(self.context, {
            "accounts": [
                {
                    "accountPath": str(self.account),
                    "agentProfile": "coder",
                    "model": "grok-4.6",
                    "profile": self.old_profile,
                    "provider": "grok",
                },
                {
                    "accountPath": str(self.root / "kimi"),
                    "agentProfile": "coder",
                    "model": "k3",
                    "profile": self.kimi_profile,
                    "provider": "kimi",
                },
            ],
            "codexPath": "/home/timwhite/.local/bin/symphony-grok-codex-completion",
            "codexSha256": self.old_sha,
        })
        self.env = mock.patch.dict(os.environ, {"SYMPHONY_GROK_AUTH_PATH": str(self.live)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.root)

    def test_dry_run_prints_the_new_row_and_write_is_explicit(self):
        before = self.context.read_bytes()
        live_before = self.live.read_bytes()
        stdout = io.StringIO()
        with mock.patch("sys.stdout", stdout):
            self.assertEqual(reenroll.main(["--context", str(self.context), "--codex", str(self.codex)]), 0)
        report = json.loads(stdout.getvalue())
        self.assertTrue(report["dryRun"])
        self.assertFalse(report["wrote"])
        self.assertIsNone(report["backup"])
        self.assertTrue(report["profileChanged"])
        self.assertEqual(report["previousProfile"], self.old_profile)
        self.assertEqual(report["grok"]["profile"], trust.profile_identity(self.account))
        self.assertEqual(report["grok"]["provider"], "grok")
        self.assertEqual(report["codexPath"], str(self.codex))
        self.assertEqual(report["codexSha256"], trust.digest(self.codex))
        self.assertNotEqual(report["codexSha256"], self.old_sha)
        rendered = stdout.getvalue()
        self.assertNotIn(ACCESS, rendered)
        self.assertNotIn(REFRESH, rendered)
        self.assertEqual(self.context.read_bytes(), before)
        self.assertEqual(self.live.read_bytes(), live_before)
        self.assertEqual(list(self.root.glob("*.bak-grok-reenroll-*")), [])

        stdout = io.StringIO()
        with mock.patch("sys.stdout", stdout):
            self.assertEqual(reenroll.main(["--context", str(self.context), "--codex", str(self.codex), "--write"]), 0)
        written = json.loads(stdout.getvalue())
        self.assertTrue(written["wrote"])
        self.assertFalse(written["dryRun"])
        updated = json.loads(self.context.read_text(encoding="utf-8"))
        self.assertEqual(updated["accounts"][0]["profile"], written["grok"]["profile"])
        self.assertEqual(updated["accounts"][1]["profile"], self.kimi_profile)
        self.assertEqual(updated["codexSha256"], trust.digest(self.codex))
        self.assertEqual(stat.S_IMODE(self.context.stat().st_mode), 0o600)
        backup = Path(written["backup"])
        self.assertEqual(backup.read_bytes(), before)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertFalse(any(self.root.glob(f".{self.context.name}.tmp.*")))
        self.assertEqual(self.live.read_bytes(), live_before)
        self.assertNotIn(ACCESS, stdout.getvalue())

    def test_write_refuses_an_ambiguous_seat_without_a_backup(self):
        document = json.loads(self.context.read_text(encoding="utf-8"))
        document["accounts"].append(dict(document["accounts"][0]))
        F.write_private(self.context, document)
        before = self.context.read_bytes()
        stderr = io.StringIO()
        with mock.patch("sys.stderr", stderr):
            self.assertEqual(reenroll.main(["--context", str(self.context), "--codex", str(self.codex), "--write"]), 2)
        self.assertIn("expected exactly one grok enrollment", stderr.getvalue())
        self.assertEqual(self.context.read_bytes(), before)
        self.assertEqual(list(self.root.glob("*.bak-grok-reenroll-*")), [])
        linked = self.root / "context-link.json"
        linked.symlink_to(self.context)
        with mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(reenroll.main(["--context", str(linked), "--write"]), 2)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="grok-install-"))
        self.real = Path.home() / ".local/bin/symphony-grok-codex-completion"
        self.before = self.real.read_bytes() if self.real.is_file() else None

    def tearDown(self):
        after = self.real.read_bytes() if self.real.is_file() else None
        shutil.rmtree(self.root)
        self.assertEqual(self.before, after)

    def run_installer(self, *args):
        env = os.environ.copy()
        env["SYMPHONY_GROK_COMPLETION_HOME"] = str(self.root)
        return subprocess.run(
            ["bash", str(INSTALLER), *args],
            capture_output=True, text=True, env=env, check=False,
        )

    def test_check_is_the_default_and_apply_stays_on_the_temp_home(self):
        text = INSTALLER.read_text(encoding="utf-8")
        self.assertNotIn("systemctl", text)
        self.assertNotIn("ALLOW=1", text)
        missing = self.run_installer()
        self.assertEqual(missing.returncode, 1)
        self.assertIn("MISSING", missing.stderr)
        self.assertFalse((self.root / ".local/bin/symphony-grok-codex-completion").exists())
        destination = self.root / ".local/bin/symphony-grok-codex-completion"
        destination.parent.mkdir(parents=True)
        destination.write_bytes(WRAPPER_PATH.read_bytes())
        destination.chmod(0o755)
        matched = self.run_installer("--check")
        self.assertEqual(matched.returncode, 0, matched.stderr)
        self.assertIn("OK ", matched.stdout)
        destination.write_text("drift\n", encoding="utf-8")
        drifted = self.run_installer("--check")
        self.assertEqual(drifted.returncode, 1)
        self.assertIn("DRIFT", drifted.stderr)
        self.assertEqual(destination.read_text(encoding="utf-8"), "drift\n")
        applied = self.run_installer("--apply")
        combined = applied.stdout + applied.stderr
        if applied.returncode == 0:
            self.assertIn("INSTALLED", applied.stdout)
            self.assertEqual(destination.read_bytes(), WRAPPER_PATH.read_bytes())
            self.assertTrue(os.access(destination, os.X_OK))
        else:
            self.assertEqual(applied.returncode, 2)
            # Shallow PR checkouts have no origin/main. Both refusals
            # exit 2 before any copy; neither may replace drifted bytes.
            self.assertTrue(
                "NOT_EXACT_MAIN" in combined or "ORIGIN_MAIN_UNAVAILABLE" in combined,
                combined,
            )
            self.assertEqual(destination.read_text(encoding="utf-8"), "drift\n")
        self.assertNotIn(str(self.real), combined)
        both = self.run_installer("--check", "--apply")
        self.assertEqual(both.returncode, 2)


if __name__ == "__main__":
    unittest.main()
