"""Telegram cleanup regression contracts: no network, real private state on disk."""
import asyncio
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import tempfile

SPEC = importlib.util.spec_from_file_location(
    "telegram_archive", Path(__file__).resolve().parents[1] / "telegram_archive.py")
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)
NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
OLD = NOW - timedelta(days=8)
RECENT = NOW - timedelta(days=1)


def dialog(identifier, date=OLD, **fields):
    return SimpleNamespace(id=identifier, input_entity=identifier, archived=False,
                           name=f"Private chat {identifier}", date=date, **fields)


class FakeTelegram:
    def __init__(self, dialogs=(), authorized=True, user_id=99):
        self.dialogs = list(dialogs)
        self.authorized = authorized
        self.user = SimpleNamespace(id=user_id, bot=False)
        self.edits, self.deliveries, self.events = [], [], []
        self.histories = {}
        self.failure = None
        self.fail_delivery = False
        self.connect = AsyncMock()
        self.disconnect = AsyncMock()
        self.send_code_request = AsyncMock(return_value=SimpleNamespace(phone_code_hash="challenge"))
        self.sign_in = AsyncMock()

    async def is_user_authorized(self):
        return self.authorized

    async def get_me(self):
        return self.user

    async def get_dialogs(self, **options):
        assert options == {"folder": 0, "ignore_migrated": True}
        return [item for item in self.dialogs if item.id not in self.edits]

    async def get_messages(self, entity, limit):
        assert limit == 1
        self.events.append(("history", entity))
        if entity in self.histories:
            value = self.histories[entity].pop(0)
            if isinstance(value, Exception):
                raise value
        else:
            value = next(item.date for item in self.dialogs if item.id == entity)
        return [] if value is None else [SimpleNamespace(date=value)]

    async def edit_folder(self, entity, folder):
        assert folder == 1
        if entity == self.failure:
            raise OSError("private API request details must not be logged")
        self.events.append(("archive", entity))
        self.edits.append(entity)

    async def send_file(self, target, path, **options):
        assert target == "me"
        assert options["force_document"] is True
        assert options["parse_mode"] is None
        if self.fail_delivery:
            raise OSError("private notification details")
        self.events.append(("summary", Path(path).name))
        self.deliveries.append((json.loads(Path(path).read_text()), options["caption"]))
        return SimpleNamespace(id=len(self.deliveries))


class StateTestCase(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.state = archive.prepare_state(Path(temporary.name) / "private")
        self.config = {"user_id": 99, "phone": "+12025550123", "api_id": 123,
                       "api_hash": "a" * 32}

    def run_archive(self, client, dry_run=False):
        with patch("builtins.print"):
            return asyncio.run(archive.archive(client, self.state, self.config, dry_run, NOW))

    def reports(self):
        return [archive.read_json(path) for path in self.state.glob("report-*.json")]


class ArchiveTests(StateTestCase):
    def test_archives_empty_first_then_strictly_older_than_seven_days(self):
        archived = dialog(8)
        archived.archived = True
        client = FakeTelegram([dialog(1), dialog(2, RECENT), dialog(3, None),
                               dialog(4, NOW - timedelta(days=7)), dialog(5, None),
                               dialog(99), archived, dialog(6, NOW + timedelta(days=1))])
        self.assertEqual(self.run_archive(client), 0)
        self.assertEqual(client.edits, [3, 5, 1])
        report, caption = client.deliveries[0]
        self.assertEqual([item["reason"] for item in report["archived"]], ["empty", "empty", "old"])
        self.assertEqual(report["status"], "completed")
        self.assertIn("2 empty, 1 inactive >7 days", caption)
        self.assertEqual(report["skipped"], {"recent": 3, "saved_or_archived": 2})
        self.assertEqual(self.reports()[0]["summary_message_id"], 1)

    def test_rechecks_activity_before_each_mutation(self):
        client = FakeTelegram([dialog(1, None), dialog(2)])
        client.histories = {1: [None, RECENT], 2: [OLD, NOW]}
        self.assertEqual(self.run_archive(client), 0)
        self.assertEqual(client.edits, [])
        self.assertEqual(self.reports()[0]["skipped"], {"activity_changed": 2})

    def test_repeated_run_ignores_previously_archived_dialogs(self):
        client = FakeTelegram([dialog(1, None), dialog(2)])
        self.assertEqual(self.run_archive(client), 0)
        self.assertEqual(self.run_archive(client), 0)
        self.assertEqual(client.edits, [1, 2])
        self.assertEqual(len(client.deliveries), 2)
        self.assertEqual(client.deliveries[1][0]["archived"], [])

    def test_dry_run_reports_candidates_without_mutation_or_delivery(self):
        client = FakeTelegram([dialog(1), dialog(2, None)])
        self.assertEqual(self.run_archive(client, dry_run=True), 0)
        report = self.reports()[0]
        self.assertEqual([item["id"] for item in report["planned"]], [2, 1])
        self.assertEqual(report["archived"], [])
        self.assertEqual(client.edits, [])
        self.assertEqual(client.deliveries, [])
        asyncio.run(archive.deliver_pending(client, self.state))
        self.assertEqual(client.deliveries, [])

    def test_history_error_does_not_turn_unknown_history_into_empty_chat(self):
        client = FakeTelegram([dialog(1, None)])
        client.histories = {1: [PermissionError("private title and request")]}
        self.assertEqual(self.run_archive(client), 1)
        self.assertEqual(client.edits, [])
        report, _ = client.deliveries[0]
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["error_type"], "PermissionError")
        self.assertNotIn("private title", json.dumps(report))

    def test_partial_failure_preserves_and_delivers_successful_moves(self):
        client = FakeTelegram([dialog(1), dialog(2, None), dialog(3)])
        client.failure = 3
        self.assertEqual(self.run_archive(client), 1)
        self.assertEqual(client.edits, [2, 1])
        report, caption = client.deliveries[0]
        self.assertEqual(report["status"], "failed")
        self.assertEqual([item["id"] for item in report["archived"]], [2, 1])
        self.assertIn("Archived 2 chats", caption)
        self.assertNotIn("private API", json.dumps(report))

    def test_failed_summary_retries_on_next_run_before_any_more_archives(self):
        client = FakeTelegram([dialog(1, None)])
        client.fail_delivery = True
        with self.assertRaises(OSError):
            self.run_archive(client)
        self.assertEqual(self.reports()[0]["summary_message_id"], None)
        client.fail_delivery = False
        client.dialogs.append(dialog(2))
        self.assertEqual(self.run_archive(client), 0)
        events = [event for event, _ in client.events if event != "history"]
        self.assertEqual(events, ["archive", "summary", "archive", "summary"])
        self.assertEqual(client.edits, [1, 2])
        self.assertEqual(len(client.deliveries), 2)
        asyncio.run(archive.deliver_pending(client, self.state))
        self.assertEqual(len(client.deliveries), 2)

    def test_interrupted_report_is_delivered_as_interrupted(self):
        client = FakeTelegram([dialog(1)])
        self.run_archive(client, dry_run=True)
        path = next(self.state.glob("report-*.json"))
        report = archive.read_json(path)
        report.update(dry_run=False, status="running")
        archive.write_json(path, report)
        asyncio.run(archive.deliver_pending(client, self.state))
        self.assertEqual(client.deliveries[0][0]["status"], "interrupted")

    def test_revoked_session_never_requests_code_or_changes_chats(self):
        client = FakeTelegram([dialog(1)], authorized=False)
        with self.assertRaisesRegex(archive.ArchiveError, "run login"):
            self.run_archive(client)
        client.send_code_request.assert_not_awaited()
        client.sign_in.assert_not_awaited()
        self.assertEqual(client.edits, [])
        self.assertEqual(self.reports(), [])

    def test_wrong_account_or_bot_never_archives(self):
        for identifier, bot in ((100, False), (99, True)):
            client = FakeTelegram([dialog(1)], user_id=identifier)
            client.user.bot = bot
            with self.assertRaises(archive.ArchiveError):
                self.run_archive(client)
            self.assertEqual(client.edits, [])

    def test_unknown_dates_are_skipped_and_naive_utc_is_supported(self):
        client = FakeTelegram([dialog(1), dialog(2, OLD.replace(tzinfo=None))])
        client.histories = {1: [SimpleNamespace()]}
        # A service/deleted message with no date is not proof of empty history.
        original = client.get_messages

        async def messages(entity, limit):
            return [SimpleNamespace(date=None)] if entity == 1 else await original(entity, limit)

        client.get_messages = messages
        self.assertEqual(self.run_archive(client), 0)
        self.assertEqual(client.edits, [2])
        self.assertEqual(self.reports()[0]["skipped"], {"unknown_date": 1})

    def test_state_permissions_locking_and_atomic_report_replacement(self):
        archive.write_json(self.state / "account.json", self.config)
        (self.state / "account.json").chmod(0o644)
        self.assertEqual(archive.read_json(self.state / "account.json"), self.config)
        with archive.session_lock(self.state):
            with self.assertRaisesRegex(archive.ArchiveError, "session lock"):
                with archive.session_lock(self.state):
                    self.fail("concurrent session lock acquired")
        with archive.session_lock(self.state):
            archive.write_json(self.state / "account.json", {**self.config, "user_id": 100})
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o700)
        for path in self.state.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(archive.read_json(self.state / "account.json")["user_id"], 100)
        self.assertFalse(list(self.state.glob(".write-*")))

    def test_refuses_symlink_state_files_and_git_checkout_state(self):
        outside = self.state.parent / "outside"
        outside.write_text("keep me")
        (self.state / "account.json").symlink_to(outside)
        with self.assertRaises(archive.ArchiveError):
            archive.write_json(self.state / "account.json", self.config)
        self.assertEqual(outside.read_text(), "keep me")
        alias = self.state.parent / "alias"
        alias.symlink_to(self.state, target_is_directory=True)
        with self.assertRaises(archive.ArchiveError):
            archive.prepare_state(alias)
        checkout = self.state.parent / "repo"
        checkout.mkdir()
        (checkout / ".git").touch()
        with self.assertRaisesRegex(archive.ArchiveError, "outside a Git checkout"):
            archive.prepare_state(checkout / "state")
        with self.assertRaisesRegex(archive.ArchiveError, "control characters"):
            archive.prepare_state(self.state.parent / "injected\ncron")

    def test_reuses_saved_inputs_even_when_environment_changes(self):
        archive.write_json(self.state / "account.json", self.config)
        with patch.dict(os.environ, {"TELEGRAM_API_ID": "456", "TELEGRAM_PHONE": "+442079460123"}), \
                patch.object(archive.getpass, "getpass", side_effect=AssertionError("prompted")):
            self.assertEqual(archive.load_config(self.state, interactive=True), self.config)

    def test_persists_normalized_inputs_before_requesting_otp(self):
        with patch.dict(os.environ, {"TELEGRAM_API_ID": "123", "TELEGRAM_API_HASH": "a" * 32,
                                     "TELEGRAM_PHONE": "+2025550123"}):
            config = archive.load_config(self.state, interactive=True)
        self.assertEqual(config["phone"], "+12025550123")
        self.assertEqual(archive.read_json(self.state / "account.json"), config)

    def test_missing_inputs_fail_without_prompting_headless(self):
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(archive.getpass, "getpass", side_effect=AssertionError("prompted")):
            with self.assertRaises(archive.ArchiveError):
                archive.load_config(self.state, interactive=False)

    def test_invalid_credentials_and_phone_are_rejected_without_leaking_them(self):
        for changes in ({"api_id": "invalid"}, {"api_id": 0}, {"api_hash": "bad-secret"},
                        {"phone": "private-invalid-input"}):
            archive.write_json(self.state / "account.json", {**self.config, **changes})
            with self.assertRaises(archive.ArchiveError) as caught:
                archive.load_config(self.state, interactive=False)
            self.assertNotIn("bad-secret", str(caught.exception))
            self.assertNotIn("private-invalid-input", str(caught.exception))

    def test_phone_normalization_reuses_historical_us_format(self):
        for phone in ("2025550123", "+2025550123", "1 (202) 555-0123", "0012025550123"):
            self.assertEqual(archive.normalize_phone(phone), "+12025550123")
        self.assertEqual(archive.normalize_phone("+44 20 7946 0123"), "+442079460123")

    def test_cron_uses_absolute_paths_quotes_spaces_and_escapes_percent(self):
        line = archive.cron_line(Path("/tmp/telegram state%test"))
        self.assertTrue(line.startswith("0 7 * * * "))
        self.assertIn("'/tmp/telegram state\\%test/venv/bin/python'", line)
        self.assertIn("archive --state-dir '/tmp/telegram state\\%test'", line)

    def test_requests_have_bounded_timeouts(self):
        async def hang():
            await asyncio.sleep(10)

        with patch.object(archive, "RPC_TIMEOUT", 0.001):
            with self.assertRaises(TimeoutError):
                asyncio.run(archive.rpc(hang()))


class LoginTests(StateTestCase):
    def setUp(self):
        super().setUp()
        errors = ModuleType("telethon.errors")
        self.password_error = type("SessionPasswordNeededError", (Exception,), {})
        errors.SessionPasswordNeededError = self.password_error
        self.modules = patch.dict(sys.modules, {"telethon.errors": errors})
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def do_login(self, client, tty=True, answers=()):
        with patch.object(sys.stdin, "isatty", return_value=tty), \
                patch.object(archive.getpass, "getpass", side_effect=answers), patch("builtins.print"):
            asyncio.run(archive.login(client, self.state, self.config))

    def test_initial_login_persists_account_but_never_otp(self):
        client = FakeTelegram(authorized=False)
        self.do_login(client, answers=["ephemeral-code"])
        client.send_code_request.assert_awaited_once_with(self.config["phone"])
        client.sign_in.assert_awaited_once_with(self.config["phone"], "ephemeral-code",
                                               phone_code_hash="challenge")
        stored = (self.state / "account.json").read_text()
        self.assertNotIn("ephemeral-code", stored)
        self.assertNotIn("challenge", stored)
        self.assertEqual(json.loads(stored)["user_id"], 99)

    def test_two_factor_password_is_used_once_and_never_persisted(self):
        client = FakeTelegram(authorized=False)
        client.sign_in.side_effect = [self.password_error(), None]
        self.do_login(client, answers=["ephemeral-code", "ephemeral-password"])
        self.assertEqual(client.sign_in.await_count, 2)
        self.assertEqual(client.sign_in.await_args.kwargs, {"password": "ephemeral-password"})
        self.assertNotIn("ephemeral-password", (self.state / "account.json").read_text())

    def test_saved_session_reuses_authorization_without_asking_for_code(self):
        client = FakeTelegram()
        self.do_login(client, tty=False)
        client.send_code_request.assert_not_awaited()
        client.sign_in.assert_not_awaited()

    def test_login_without_terminal_never_sends_code(self):
        client = FakeTelegram(authorized=False)
        with self.assertRaisesRegex(archive.ArchiveError, "terminal"):
            self.do_login(client, tty=False)
        client.send_code_request.assert_not_awaited()

    def test_changed_login_account_is_rejected(self):
        with self.assertRaisesRegex(archive.ArchiveError, "differs"):
            self.do_login(FakeTelegram(user_id=100))

    def test_client_disconnects_when_archive_fails(self):
        client = FakeTelegram(authorized=False)
        with patch.object(archive, "make_client", return_value=client):
            with self.assertRaises(archive.ArchiveError):
                asyncio.run(archive.run("archive", self.state, self.config, False))
        client.disconnect.assert_awaited_once()

    def test_client_factory_uses_same_sqlite_session_and_finite_retries(self):
        module = ModuleType("telethon")
        module.TelegramClient = unittest.mock.Mock()
        with patch.dict(sys.modules, {"telethon": module}):
            archive.make_client(self.state, self.config)
            archive.make_client(self.state, self.config)
        for call in module.TelegramClient.call_args_list:
            self.assertEqual(call.args[0], str(self.state / "telegram.session"))
            self.assertEqual(call.kwargs["request_retries"], 2)
            self.assertEqual(call.kwargs["connection_retries"], 2)

    def test_bootstrap_installs_hashed_dependencies_and_reexecutes_in_saved_venv(self):
        with patch.object(archive.subprocess, "run") as command, patch.object(os, "execv") as execute:
            archive.bootstrap(self.state, ["login", "--state-dir", str(self.state)])
        self.assertEqual(command.call_count, 2)
        self.assertIn("--require-hashes", command.call_args.args[0])
        self.assertEqual(execute.call_args.args[0], str(self.state / "venv/bin/python"))
        with patch.object(sys, "prefix", str(self.state / "venv")), \
                patch.object(archive.subprocess, "run", side_effect=AssertionError("reinstalled")):
            archive.bootstrap(self.state, ["login"])

    def test_archive_main_never_bootstraps_or_prompts(self):
        with patch.object(archive, "bootstrap", side_effect=AssertionError("bootstrapped")), \
                patch.dict(os.environ, {}, clear=True), patch("builtins.print"):
            self.assertEqual(archive.main(["archive", "--state-dir", str(self.state)]), 1)

    def test_cli_cron_and_no_credentials_archive_work_from_another_directory(self):
        script = Path(archive.__file__).resolve()
        environment = {k: v for k, v in os.environ.items() if not k.startswith("TELEGRAM_")}
        result = subprocess.run([sys.executable, str(script), "cron", "--state-dir", str(self.state)],
                                cwd="/tmp", env=environment, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(str(script), result.stdout)
        result = subprocess.run([sys.executable, str(script), "archive", "--state-dir", str(self.state)],
                                cwd="/tmp", env=environment, stdin=subprocess.DEVNULL,
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertIn("run the login command", result.stderr)


if __name__ == "__main__":
    unittest.main()
