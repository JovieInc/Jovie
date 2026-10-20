"""Regression tests for scripts/lanes/codex_lane.py (Codex accounts as a shipping lane).

Run with:
    python3 -m unittest scripts/tests/test_codex_lane.py -v
"""
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import ANY, patch
from types import SimpleNamespace
from pathlib import Path
from contextlib import redirect_stdout

ROOT = Path(__file__).resolve().parents[2]


def read_ready_pid(path: Path, deadline: float) -> int | None:
    """Wait until `path` holds a pid.

    The metadata child used to create the ready file and then write the pid.
    A reader that returns on existence can observe an empty file
    (`int('')` raises ValueError). Publication is an atomic replace; this wait
    still accepts only a parseable pid and fails closed when the deadline passes.
    """
    while True:
        try:
            text = path.read_text().strip()
        except OSError:
            text = ""
        if text:
            try:
                return int(text)
            except ValueError:
                pass
        if time.monotonic() >= deadline:
            return None
        time.sleep(0.01)
SPEC = importlib.util.spec_from_file_location("codex_lane", ROOT / "scripts/lanes/codex_lane.py")
codex = importlib.util.module_from_spec(SPEC)
sys.modules["codex_lane"] = codex
SPEC.loader.exec_module(codex)


def profile(root: Path, name: str, kind: str = "chatgpt") -> None:
    home = root / name
    home.mkdir(parents=True)
    auth = {"tokens": {"access_token": "t", "id_token": "i"}} if kind == "chatgpt" else {"OPENAI_API_KEY": "sk"}
    (home / "auth.json").write_text(json.dumps(auth))


def rate_snapshot(now=1_000_000, credits=None, secondary=True) -> dict:
    limits = {"planType": "pro", "primary": {"usedPercent": 50, "resetsAt": now + 7200, "windowDurationMins": 10080}}
    if secondary: limits["secondary"] = {"usedPercent": 80, "resetsAt": now + 3600, "windowDurationMins": 300}
    return {"account": {"account": {"type": "chatgpt", "planType": "pro"}},
            "rateLimits": {"rateLimits": limits, "rateLimitResetCredits": credits},
            "messages": {"messages": []}}


def current_snapshot(now=1_000_000):
    return {**rate_snapshot(now), "models": {"data": [{"id": "gpt-6.1-sol", "hidden": False}],
                                             "nextCursor": None}}


class Isolated(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (codex.ACCOUNTS_ROOT, codex.STATE)
        codex.ACCOUNTS_ROOT = root / "accounts"
        codex.STATE = root / "state" / "codex-accounts.json"
        profile(codex.ACCOUNTS_ROOT, "alpha")
        profile(codex.ACCOUNTS_ROOT, "beta")
        profile(codex.ACCOUNTS_ROOT, "openrouter", kind="apikey")
        (codex.ACCOUNTS_ROOT / "locks").mkdir()

    def tearDown(self):
        codex.ACCOUNTS_ROOT, codex.STATE = self.saved
        self.tmp.cleanup()


class AccountsTest(Isolated):
    def test_only_chatgpt_profiles_are_accounts(self):
        self.assertEqual(codex.accounts(), ["alpha", "beta"])

    def test_pick_is_least_recently_used_and_skips_exhausted(self):
        now = 1_000_000.0
        state = {"alpha": {"lastUsed": now - 10}, "beta": {"lastUsed": now - 100}}
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "beta")
        handle.close()
        state["beta"]["exhaustedUntil"] = now + 3600
        name, handle = codex.pick(state, now)
        self.assertEqual(name, "alpha")
        handle.close()
        state["alpha"]["exhaustedUntil"] = now + 60
        self.assertEqual(codex.pick(state, now), (None, None))
        self.assertEqual(codex.pick(state, now + 61)[0], "alpha")

    def test_leases_are_exclusive_while_held(self):
        name, first = codex.pick({}, 1.0)
        second_name, second = codex.pick({}, 1.0)
        self.assertNotEqual(name, second_name)
        third = codex.pick({}, 1.0)
        self.assertEqual(third, (None, None))
        first.close()
        second.close()
        again, handle = codex.pick({}, 1.0)
        self.assertIsNotNone(again)
        handle.close()


class CurrentLoginTest(Isolated):
    def setUp(self):
        super().setUp()
        self.root = Path(self.tmp.name)
        self.cli = self.root / "codex"
        self.env = patch.dict(os.environ, {
            "CODEX_LANE_AUTH_MODE": "current-login", "CODEX_LANE_CLI": str(self.cli),
            "CODEX_HOME": str(self.root / "existing-login"), "OPENAI_API_KEY": "must-not-reach-child",
            "OPENAI_BASE_URL": "https://unavailable.invalid", "CODEX_API_KEY": "must-not-reach-child",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def fake_cli(self, output="OK", code=0, auth="Logged in using ChatGPT", auth_code=0):
        self.cli.write_text(
            f"#!{sys.executable}\nimport json,os,sys\nfrom pathlib import Path\n"
            f"root=Path({str(self.root)!r})\n"
            f"if sys.argv[1:]==['login','status']:\n print({auth!r}); sys.exit({auth_code})\n"
            "if '--approve-for-me' in sys.argv:\n print(\"error: unexpected argument '--approve-for-me' found\"); sys.exit(2)\n"
            "assert not any(k in os.environ for k in ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY'])\n"
            "assert os.environ['CODEX_HOME'].endswith('existing-login')\n"
            "(root/'launch.json').write_text(json.dumps(sys.argv))\n"
            f"sys.stdin.read(); print({output!r}); sys.exit({code})\n")
        self.cli.chmod(0o700)

    def invoke(self):
        prompt = self.root / "prompt.txt"
        prompt.write_text("Implement the assigned issue")
        return codex.run(SimpleNamespace(prompt_file=str(prompt), receipt_file=str(self.root / "receipt.jsonl"),
                                        cwd=str(self.root), model=None, reasoning_effort="high"))

    def test_one_login_holds_configured_concurrent_slots_and_reports_free_ones(self):
        # Tim 2026-10-11: more runs on the one current login, no account rotation.
        self.fake_cli()
        handles = []
        with patch.dict(os.environ, {"CODEX_LANE_LOGIN_SLOTS": "3"}):
            self.assertEqual(codex.status()["accounts"][codex.CURRENT_LOGIN]["freeSlots"], 3)
            for expected_free in (2, 1, 0):
                name, handle = codex.pick({}, 1.0)
                self.assertEqual(name, codex.CURRENT_LOGIN)
                handles.append(handle)
                row = codex.status()["accounts"][codex.CURRENT_LOGIN]
                self.assertEqual((row["freeSlots"], row["leased"]), (expected_free, expected_free == 0))
            self.assertEqual(codex.pick({}, 1.0), (None, None), "never more runs than slots")
            handles.pop().close()
            self.assertEqual(codex.status()["accounts"][codex.CURRENT_LOGIN]["freeSlots"], 1)
        for handle in handles:
            handle.close()
        name, handle = codex.pick({}, 1.0)
        self.assertEqual(codex.pick({}, 1.0), (None, None), "default stays one exclusive run")
        handle.close()

    def test_logged_in_cli_clears_an_auth_bank_before_picking(self):
        self.fake_cli()
        codex.write_state({codex.CURRENT_LOGIN: {"lastKind": "auth", "lastError": "429", "exhaustedUntil": 10_000.0}})
        name, handle = codex.pick(codex.read_state(), 1.0)
        self.assertEqual(name, codex.CURRENT_LOGIN)
        handle.close()
        row = codex.read_state()[codex.CURRENT_LOGIN]
        self.assertNotIn("exhaustedUntil", row)
        self.assertEqual(row["lastKind"], "auth-reverified")
        self.fake_cli(auth="Not logged in", auth_code=1)
        codex.write_state({codex.CURRENT_LOGIN: {"lastKind": "auth", "exhaustedUntil": 10_000.0}})
        self.assertEqual(codex.pick(codex.read_state(), 1.0), (None, None), "a real logout stays benched")

    def test_existing_cli_login_without_opening_credentials_or_scanning_profiles(self):
        self.fake_cli()
        with patch.object(Path, "glob", side_effect=AssertionError("profile discovery")):
            self.assertEqual(codex.accounts(), ["current-login"])
        self.assertEqual(self.invoke(), 0)
        argv = json.loads((self.root / "launch.json").read_text())
        self.assertIn('forced_login_method="chatgpt"', argv)
        self.assertIn('model_provider="openai"', argv)
        self.assertEqual(argv[argv.index('--sandbox') + 1], 'workspace-write')
        self.assertIn('approval_policy="on-request"', argv)
        self.assertIn('approvals_reviewer="auto_review"', argv)
        self.assertNotIn("--approve-for-me", argv)
        self.assertNotIn('approval_policy="never"', argv)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertEqual([json.loads(row)["account"] for row in (self.root / "receipt.jsonl").read_text().splitlines()],
                         ["current-login", "current-login"])

    def test_missing_broken_api_or_unknown_login_never_launches_inference(self):
        for auth, code in [("Logged in using an API key", 0), ("unknown", 0), ("Logged in using ChatGPT", 1)]:
            with self.subTest(auth=auth, code=code):
                self.fake_cli(auth=auth, auth_code=code)
                self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
                self.assertFalse((self.root / "launch.json").exists())
        self.cli.unlink()
        self.assertEqual(codex.accounts(), [])

    def test_auth_probe_timeout_fails_closed(self):
        with patch.object(codex.subprocess, "run", side_effect=codex.subprocess.TimeoutExpired("codex", 10)):
            self.assertEqual(codex.accounts(), [])

    def test_one_exclusive_lease_and_no_duplicate_launch(self):
        self.fake_cli()
        name, handle = codex.pick({}, time.time())
        self.assertEqual(name, "current-login")
        try:
            with patch.object(codex, "LEASE_WAIT_S", 0):
                self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
            self.assertFalse((self.root / "launch.json").exists())
        finally:
            handle.close()
        self.assertEqual(self.invoke(), 0)

    def test_a_busy_lease_is_waited_for_not_reported_as_exhaustion(self):
        # Gem 2026-10-11 18:38-18:43: concurrent runs lost the one lease, exited 75, were charged
        # a fix attempt or cooled the whole provider while the account was healthy.
        self.fake_cli()
        name, handle = codex.pick({}, time.time())
        self.assertEqual(name, "current-login")
        waits = []
        real_sleep = time.sleep
        def release(seconds):
            # time.sleep is global: subprocess's own wait loop (codex login status) also calls it
            # on a loaded host (Gem, load ~16, 2026-10-12). Only the lane's lease wait releases.
            if seconds < codex.LEASE_POLL_S:
                return real_sleep(seconds)
            waits.append(seconds)
            handle.close()
        with patch.object(codex.time, "sleep", side_effect=release):
            self.assertEqual(self.invoke(), 0)
        self.assertEqual(waits, [codex.LEASE_POLL_S])
        self.assertTrue((self.root / "launch.json").exists())
        self.assertEqual(codex.read_state()["current-login"]["runs"], 1, "the wait itself is not a run")

    def test_successful_run_clears_a_stale_last_error(self):
        self.fake_cli()
        codex.write_state({"current-login": {"lastKind": "auth", "lastError": "401", "runs": 2}})
        self.assertEqual(self.invoke(), 0)
        entry = codex.read_state()["current-login"]
        self.assertEqual(entry["lastKind"], "ok")
        self.assertNotIn("lastError", entry)

    def test_limit_banks_single_login_without_rotation_or_credit_redemption(self):
        self.fake_cli("You've hit your usage limit. Try again in 2 hours.", 1)
        real_sleep = time.sleep
        def no_rotation_pause(seconds):
            # subprocess's own wait loop also calls the global time.sleep on a loaded host;
            # only the lane's rotate/lease pauses mean rotation.
            if seconds >= min(codex.ROTATE_PAUSE_S, codex.LEASE_POLL_S):
                raise AssertionError("rotation")
            return real_sleep(seconds)
        with patch.object(codex, "maybe_redeem", side_effect=AssertionError("credit redemption")), \
                patch.object(codex.time, "sleep", side_effect=no_rotation_pause):
            self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
        state = codex.read_state()
        self.assertEqual(list(state), ["current-login"])
        self.assertEqual(state["current-login"]["lastKind"], "limit")
        self.assertEqual(state["current-login"]["runs"], 1)
        self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
        self.assertEqual(codex.read_state()["current-login"]["runs"], 1)
        name, handle = codex.pick(state, state["current-login"]["exhaustedUntil"] + 1)
        self.assertEqual(name, "current-login")
        handle.close()

    def test_rate_and_auth_failures_release_lease_and_bank_without_retry(self):
        for output, kind in [("error: 429 Too Many Requests", "rate"), ("error: login required", "auth")]:
            with self.subTest(kind=kind):
                codex.write_state({})
                self.fake_cli(output, 1)
                self.assertEqual(self.invoke(), codex.NO_ACCOUNT_EXIT)
                self.assertEqual(codex.read_state()["current-login"]["lastKind"], kind)
                handle = codex.lease("current-login")
                self.assertIsNotNone(handle)
                handle.close()

    def test_reconciliation_uses_only_public_current_login_metadata(self):
        replies = [current_snapshot()[key] for key in ("account", "rateLimits", "models")]
        with patch.object(codex, "app_server_calls", return_value=replies) as calls, \
                patch.object(codex, "accounts", side_effect=AssertionError("profile enumeration")), \
                patch.object(codex, "maybe_redeem", side_effect=AssertionError("credit redemption")):
            self.assertTrue(codex.reconcile(1_000_000, 0)["reconciled"])
        calls.assert_called_once_with('current-login', [
            ('account/read', {'refreshToken': False}), ('account/rateLimits/read', None),
            ('model/list', {'limit': 100, 'includeHidden': False})], lease_handle=ANY)
        value = codex.read_state()['current-login']['capacityLease']
        self.assertEqual(value['usableCapacityRemaining']['primary']['remainingPercent'], 50)
        self.assertEqual(value['compatibility']['models'], ['gpt-6.1-sol'])
        self.assertEqual(value['sources']['announcements']['reconciliation'], 'not-requested')

    def test_metadata_transport_forces_subscription_and_rejects_private_methods(self):
        trace = self.root / 'metadata.json'
        self.cli.write_text(f'''#!{sys.executable}
import json, os, sys
from pathlib import Path
seen = []
replies = {current_snapshot()!r}
for line in sys.stdin:
    request = json.loads(line)
    if 'id' not in request:
        continue
    seen.append(request)
    method = request['method']
    value = {{'account/read': replies['account'], 'account/rateLimits/read': replies['rateLimits'],
             'model/list': replies['models']}}.get(method, {{}})
    Path({str(trace)!r}).write_text(json.dumps({{'requests': seen, 'argv': sys.argv[1:],
        'home': os.environ['CODEX_HOME'], 'apiEnvPresent': any(k in os.environ for k in
        ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'AZURE_OPENAI_API_KEY'])}}))
    print(json.dumps({{'id': request['id'], 'result': value}}), flush=True)
''')
        self.cli.chmod(0o755)
        self.assertTrue(codex.reconcile(1_000_000, 0)['reconciled'])
        captured = json.loads(trace.read_text())
        self.assertEqual(captured['home'], str(self.root / 'existing-login'))
        self.assertFalse(captured['apiEnvPresent'])
        self.assertIn('forced_login_method="chatgpt"', captured['argv'])
        self.assertEqual(captured['requests'][0]['params']['capabilities'], {'experimentalApi': False})
        self.assertEqual([r['method'] for r in captured['requests']],
                         ['initialize', 'account/read', 'account/rateLimits/read', 'model/list'])
        for name, calls in [('current-login', [('account/workspaceMessages/read', None)]),
                            ('alpha', codex.CURRENT_METADATA_CALLS),
                            ('current-login', [('account/rateLimitResetCredits/redeem', {'id': 'x'})])]:
            with self.subTest(name=name, calls=calls), \
                    patch.object(codex.subprocess, 'Popen', side_effect=AssertionError('private launch')):
                with self.assertRaises(ValueError):
                    codex.app_server_calls(name, calls)

    def test_observer_preserves_all_auth_quota_and_execution_banks(self):
        before = {'exhaustedUntil': 1_100_000, 'lastKind': 'auth', 'runs': 12, 'lastUsed': 999_999,
                  'pendingReset': {'before': 'protected'}, 'lifecycle': {'source': 'existing'}}
        codex.write_state({'current-login': before, 'other-existing-row': {'exhaustedUntil': 2_000_000}})
        codex.reconcile(1_000_000, 0, lambda _: current_snapshot())
        after = codex.read_state()
        self.assertEqual({k: after['current-login'][k] for k in before}, before)
        self.assertEqual(after['other-existing-row'], {'exhaustedUntil': 2_000_000})
        self.assertFalse(codex.available('current-login', after, 1_000_000))
        self.assertEqual(len((codex.STATE.parent / 'capacity-events.jsonl').read_text().splitlines()), 1)

    def test_active_execution_lease_prevents_any_metadata_call(self):
        handle = codex.lease('current-login')
        try:
            with patch.object(codex, 'current_subscription_snapshot', side_effect=AssertionError('active execution')):
                self.assertEqual(codex.reconcile(1_000_000, 0),
                                 {'reconciled': False, 'reason': 'account-lease-busy'})
            self.assertEqual(codex.read_state(), {})
        finally:
            handle.close()

    def test_unknown_metadata_is_bounded_by_cadence_and_never_certifies_capacity(self):
        for snapshot in [None, {}, {**current_snapshot(), 'account': {'account': {'type': 'apiKey'}}},
                         {**current_snapshot(), 'rateLimits': {}},
                         {**current_snapshot(), 'models': {'data': [], 'nextCursor': 'more'}}]:
            with self.subTest(snapshot=snapshot):
                codex.write_state({'current-login': {'exhaustedUntil': 1_100_000, 'lastKind': 'limit'}})
                with patch.object(codex, 'current_subscription_snapshot', return_value=snapshot) as fetch:
                    self.assertFalse(codex.reconcile(1_000_000)['reconciled'])
                    self.assertEqual(codex.reconcile(1_000_001), {'reconciled': False, 'reason': 'cadence'})
                    fetch.assert_called_once()
                self.assertNotIn('capacityLease', codex.read_state()['current-login'])
                self.assertEqual(codex.read_state()['current-login']['exhaustedUntil'], 1_100_000)
                handle = codex.lease('current-login')
                self.assertIsNotNone(handle)
                handle.close()

    def test_invalid_or_expired_capacity_and_ambiguous_models_stay_unknown(self):
        for field, value in [('usedPercent', True), ('usedPercent', float('nan')),
                             ('usedPercent', -1), ('usedPercent', 101), ('resetsAt', 999_999)]:
            snapshot = current_snapshot()
            snapshot['rateLimits']['rateLimits']['primary'][field] = value
            with self.subTest(field=field, value=value):
                self.assertFalse(codex.reconcile(1_000_000, 0, lambda _: snapshot)['reconciled'])
        snapshot = current_snapshot()
        snapshot['models']['data'] = [None]
        self.assertFalse(codex.reconcile(1_000_000, 0, lambda _: snapshot)['reconciled'])

    def test_storage_failure_before_attempt_prevents_provider_access(self):
        with patch.object(codex, 'update_state', side_effect=OSError('disk full')), \
                patch.object(codex, 'current_subscription_snapshot') as fetch:
            self.assertFalse(codex.reconcile(1_000_000)['reconciled'])
            fetch.assert_not_called()
        handle = codex.lease('current-login')
        self.assertIsNotNone(handle)
        handle.close()

    def test_corrupt_existing_banking_state_is_preserved_without_metadata_access(self):
        for raw in ('{"current-login":{"exhaustedUntil":', '[]',
                    '{"current-login":null}', '{"_ledger":[]}'):
            with self.subTest(raw=raw):
                codex.STATE.parent.mkdir(parents=True, exist_ok=True)
                codex.STATE.write_text(raw)
                with patch.object(codex, 'current_subscription_snapshot') as fetch:
                    self.assertEqual(codex.reconcile(1_000_000),
                                     {'reconciled': False, 'reason': 'banking-state-unreadable'})
                    fetch.assert_not_called()
                self.assertEqual(codex.STATE.read_text(), raw)

    def test_unreadable_banking_state_does_not_bootstrap_empty_state(self):
        read = Path.read_text
        def deny(path, *args, **kwargs):
            if path == codex.STATE:
                raise PermissionError('denied')
            return read(path, *args, **kwargs)
        with patch.object(Path, 'read_text', deny), \
                patch.object(codex, 'current_subscription_snapshot') as fetch:
            self.assertEqual(codex.reconcile(1_000_000),
                             {'reconciled': False, 'reason': 'banking-state-unreadable'})
            fetch.assert_not_called()
        self.assertFalse(codex.STATE.exists())

    def test_concurrent_corruption_under_state_lock_prevents_prestamp_and_request(self):
        original = codex.update_state
        def corrupt_then_update(change):
            codex.STATE.parent.mkdir(parents=True, exist_ok=True)
            codex.STATE.write_text('{"current-login":')
            return original(change)
        with patch.object(codex, 'update_state', side_effect=corrupt_then_update), \
                patch.object(codex, 'current_subscription_snapshot') as fetch:
            self.assertFalse(codex.reconcile(1_000_000)['reconciled'])
            fetch.assert_not_called()
        self.assertEqual(codex.STATE.read_text(), '{"current-login":')

    def test_real_metadata_child_retains_lease_until_delayed_reap(self):
        # The child needs no model calls: EOF ends the fake public protocol.
        self.cli.write_text(f'''#!{sys.executable}
import json, sys
for line in sys.stdin:
    request = json.loads(line)
    if 'id' in request:
        print(json.dumps({{'id': request['id'], 'result': {{}}}}), flush=True)
''')
        self.cli.chmod(0o755)
        original = codex.subprocess.Popen
        waits = []
        def tracked(*args, **kwargs):
            proc = original(*args, **kwargs)
            wait, kill = proc.wait, proc.kill
            proc.terminate = lambda: None
            def delay_wait(*args, **kwargs):
                self.assertIsNone(codex.lease('current-login'))
                waits.append(proc.pid)
                if len(waits) < 3:
                    raise codex.subprocess.TimeoutExpired('metadata', 2)
                return wait(*args, **kwargs)
            proc.wait = delay_wait
            proc.kill = lambda: kill() if len(waits) >= 2 else None
            return proc
        handle = codex.lease('current-login')
        try:
            with patch.object(codex.subprocess, 'Popen', side_effect=tracked):
                codex.current_subscription_snapshot('current-login', lease_handle=handle)
            self.assertEqual(len(waits), 3)
            self.assertIsNone(codex.lease('current-login'))
        finally:
            handle.close()
        again = codex.lease('current-login')
        self.assertIsNotNone(again)
        again.close()

    def test_interruption_during_cleanup_reaps_before_propagating(self):
        proc = SimpleNamespace(poll=lambda: None, terminate=lambda: None, kill=lambda: None)
        proc.wait = unittest.mock.Mock(side_effect=[KeyboardInterrupt(), 0])
        with self.assertRaises(KeyboardInterrupt):
            codex.reap_current_metadata(proc)
        self.assertEqual(proc.wait.call_count, 2)

    @unittest.skipUnless(os.name == 'posix', 'flock descriptor inheritance is POSIX')
    def test_parent_death_does_not_release_live_metadata_child_account_lease(self):
        import signal
        ready = self.root / 'metadata-child.pid'
        self.cli.write_text(f'''#!{sys.executable}
import os, time
from pathlib import Path
ready = Path({str(ready)!r})
pending = ready.with_name(ready.name + '.tmp')
pending.write_text(str(os.getpid()))
os.replace(pending, ready)
time.sleep(30)
''')
        self.cli.chmod(0o755)
        code = f'''import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('child_observer', {str(ROOT / 'scripts/lanes/codex_lane.py')!r})
m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
m.STATE=Path({str(codex.STATE)!r})
m.reconcile(1_000_000, 0)
'''
        parent = codex.subprocess.Popen([sys.executable, '-c', code],
                                        stdout=codex.subprocess.DEVNULL, stderr=codex.subprocess.DEVNULL)
        child = None
        try:
            child = read_ready_pid(ready, time.monotonic() + 5)
            self.assertIsNotNone(child, 'metadata process did not publish its pid')
            parent.kill()
            parent.wait(timeout=2)
            self.assertIsNone(codex.lease('current-login'), 'live child lost inherited account lease')
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait(timeout=2)
            if child is not None:
                try:
                    os.kill(child, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        deadline = time.monotonic() + 5
        handle = None
        while handle is None and time.monotonic() < deadline:
            handle = codex.lease('current-login')
            if handle is None:
                time.sleep(.01)
        self.assertIsNotNone(handle, 'drained metadata process kept account lease')
        handle.close()

    def test_ready_pid_waits_until_the_file_is_parseable(self):
        ready = self.root / 'metadata-child.pid'
        ready.write_text('')

        def publish():
            time.sleep(0.05)
            pending = ready.with_name(ready.name + '.tmp')
            pending.write_text('4242')
            os.replace(pending, ready)

        threading.Thread(target=publish, daemon=True).start()
        self.assertEqual(read_ready_pid(ready, time.monotonic() + 2), 4242)
        self.assertIsNone(read_ready_pid(self.root / 'missing.pid', time.monotonic()))

    def test_concurrent_corruption_before_final_merge_is_preserved(self):
        def corrupt_after_metadata(_):
            codex.STATE.write_text('{"current-login":')
            return current_snapshot()
        self.assertFalse(codex.reconcile(1_000_000, 0, corrupt_after_metadata)['reconciled'])
        self.assertEqual(codex.STATE.read_text(), '{"current-login":')

    def test_failed_observation_write_keeps_attempt_cadence(self):
        update = codex.update_state
        calls = []
        def fail_after_stamp(mutate):
            calls.append(mutate)
            if len(calls) > 1:
                raise OSError('disk full')
            return update(mutate)
        with patch.object(codex, 'update_state', side_effect=fail_after_stamp), \
                patch.object(codex, 'current_subscription_snapshot', return_value=current_snapshot()) as fetch:
            self.assertFalse(codex.reconcile(1_000_000)['reconciled'])
            self.assertEqual(codex.reconcile(1_000_001), {'reconciled': False, 'reason': 'cadence'})
            fetch.assert_called_once()
        self.assertNotIn('current-login', codex.read_state())

    def test_interrupted_provider_read_keeps_durable_cadence_and_releases_lease(self):
        with patch.object(codex, 'current_subscription_snapshot', side_effect=KeyboardInterrupt) as fetch:
            with self.assertRaises(KeyboardInterrupt):
                codex.reconcile(1_000_000)
            self.assertEqual(codex.reconcile(1_000_001), {'reconciled': False, 'reason': 'cadence'})
            fetch.assert_called_once()
        handle = codex.lease('current-login')
        self.assertIsNotNone(handle)
        handle.close()


class ClassifyTest(unittest.TestCase):
    def test_limit_message_banks_the_account_until_the_reported_reset(self):
        now = 1_000_000.0
        kind, until = codex.classify("...\nYou've hit your usage limit. Try again in 2 hours 30 minutes.\n", 1, now)
        self.assertEqual((kind, until), ("limit", now + 9000))

    def test_limit_without_a_reset_uses_the_default_cooldown(self):
        kind, until = codex.classify("error: usage limit reached", 1, 5.0)
        self.assertEqual((kind, until), ("limit", 5.0 + codex.DEFAULT_COOLDOWN_S))
        # A burst rate limit backs off briefly instead of banking the account for hours.
        self.assertEqual(codex.classify("error: rate limit exceeded", 1, 5.0), ("rate", 5.0 + codex.RATE_BACKOFF_S))

    def test_auth_failures_bank_for_a_day_and_success_clears(self):
        kind, until = codex.classify("codex: not logged in", 1, 0.0)
        self.assertEqual((kind, until), ("auth", 86400.0))
        self.assertEqual(codex.classify("codex\nOK\ntokens used\n12", 0, 0.0), ("ok", None))
        self.assertEqual(codex.classify("boom", 3, 0.0), ("error", None))

    def test_auth_words_inside_the_agents_work_do_not_bench_the_login(self):
        # 2026-10-12 on Gem: a run ending on a 429 whose work mentioned 401/unauthorized was
        # classified auth and benched the only login for 24h with 96% capacity left.
        transcript = "editing auth-guard.ts\nexpect(res.status).toBe(401) // unauthorized\n" + "work\n" * 40 \
            + "error: 429 Too Many Requests"
        self.assertEqual(codex.classify(transcript, 1, 0.0)[0], "rate")
        self.assertEqual(codex.classify("work\n" * 40 + "error: not logged in", 1, 0.0), ("auth", 86400.0))

    def test_successful_run_that_mentions_rate_limits_is_not_exhausted(self):
        transcript = "reading rate-limiter.test.ts\nexpect 429 Too Many Requests\nquota fallback\n" + "work\n" * 40 + "Done."
        self.assertEqual(codex.classify(transcript, 0, 0.0), ("ok", None))

    def test_limit_text_early_in_a_failed_run_is_not_the_failure(self):
        transcript = "handles 429 retries\n" + "step\n" * 40 + "error: stream disconnected"
        self.assertEqual(codex.classify(transcript, 1, 0.0), ("error", None))

    def test_reset_clock_times_roll_to_the_next_occurrence(self):
        now = 1_000_000.0
        until = codex.parse_reset("Try again at 2026-09-27T01:00:00Z", now)
        self.assertEqual(until, 1790470800.0)
        soon = codex.parse_reset("try again at 11:59 PM", now)
        self.assertGreater(soon, now)
        self.assertLess(soon - now, 86400)


class LedgerTest(Isolated):
    def test_announcements_keep_immediate_and_banked_promises_independent(self):
        cases = [("We reset your rate limits now.", (True, False)),
            ("You receive one banked reset credit per day.", (False, True)),
            ("We reset rate limits now and granted a reset credit.", (True, True)),
            ("We did not reset rate limits and no reset credit was granted.", (False, False)),
            ("If needed, we may reset rate limits and could grant a reset credit.", (False, False)),
            ("Last month we reset rate limits and granted a reset credit.", (False, False)),
        ]
        for index, (body, expected) in enumerate(cases):
            with self.subTest(body=body):
                parsed = codex.parse_announcement({"messageId": str(index), "messageBody": body})
                self.assertEqual((parsed["immediateReset"], parsed["bankedCreditGrant"]), expected)
        self.assertIsNone(codex.parse_announcement({"messageBody": "reset"}))
        message = {"messageId": "same", "messageBody": "A banked reset credit was granted."}
        fresh, seen = codex.announcement_evidence([message, message])
        self.assertEqual((len(fresh), codex.announcement_evidence([message], seen)[0]), (1, []))
    def test_capacity_lease_models_lifecycle_expiry_and_unknowns_without_assumptions(self):
        now = 1_000_000
        evidence = {"observedSustainableThroughputPerHour": 25, "observedConcurrency": 2,
                    "throughputObservedAt": now, "throughputConfidence": "observed"}
        expected = [({}, 3600), ({"canceledAtPeriodEnd": True, "subscriptionEndAt": now + 1200}, 1200),
                    ({"paymentFailure": True, "graceEndsAt": now + 900}, 900),
                    ({"accessLossAt": now + 60}, 60)]
        for lifecycle, unavailable in expected:
            lease = codex.build_capacity_lease("alpha", rate_snapshot(now), {**evidence, **lifecycle}, now)
            self.assertEqual((lease["timeToUnavailabilityS"], lease["throughput"]["estimatedDrainTimeS"]), (unavailable, 1440))
        summary = {"availableCount": 2, "credits": [
            {"id": "never", "status": "available", "resetType": "codexRateLimits", "grantedAt": now, "expiresAt": None},
            {"id": "soon", "status": "available", "resetType": "codexRateLimits", "grantedAt": now, "expiresAt": now + 500}]}
        lease = codex.build_capacity_lease("alpha", rate_snapshot(now, summary),
                                           {**evidence, "promotionalCredits": [{"id": "promo", "hardCap": 5, "expiresAt": now + 300}]}, now)
        deadlines = {row["id"]: row["redemptionDeadline"] for row in lease["credits"]["details"]}
        self.assertEqual(deadlines, {"never": None, "soon": now + 500, "promo": now + 300})
        unknown = codex.build_capacity_lease("alpha", {"rateLimits": {"rateLimits": {}}, "messages": {}}, {}, now)
        self.assertIsNone(unknown["timeToUnavailabilityS"])
        self.assertEqual(unknown["sources"]["lifecycle"]["reconciliation"], "unknown")
    def test_redemption_requires_terminal_lock_fresh_drain_and_usable_runway(self):
        now = 1_000_000
        credits = {"availableCount": 3, "credits": [
            {"id": "late", "status": "available", "resetType": "codexRateLimits", "grantedAt": 1, "expiresAt": now + 900},
            {"id": "early", "status": "available", "resetType": "codexRateLimits", "grantedAt": 2, "expiresAt": now + 300},
            {"id": "wrong", "status": "available", "resetType": "other", "grantedAt": 0, "expiresAt": now + 1}]}
        rates = rate_snapshot(now, credits)["rateLimits"]
        lifecycle = {"observedSustainableThroughputPerHour": 200, "observedConcurrency": 1,
                     "throughputObservedAt": now}
        decision = codex.redemption_decision("alpha", {"type": "terminal_limit"}, rates, lifecycle, True, True, now)
        self.assertEqual(decision["credit"]["id"], "early")
        self.assertIsNone(codex.select_reset_credit({"rateLimitResetCredits": {**credits, "availableCount": 4}}, now))
        self.assertEqual(decision["idempotencyKey"], codex.redemption_decision(
            "alpha", {"type": "terminal_limit"}, rates, lifecycle, True, True, now)["idempotencyKey"])
        variants = [({"type": "other"}, lifecycle, True, True, "not-terminal-limit"),
                    ({"type": "terminal_limit"}, lifecycle, True, False, "lock-lost"),
                    ({"type": "terminal_limit"}, lifecycle, False, True, "other-seat-available"),
                    ({"type": "terminal_limit"}, {}, True, True, "missing-or-stale-drain-evidence"),
                    ({"type": "terminal_limit"}, {**lifecycle, "accessLossAt": now + 100}, True, True, "access-loss-before-drain")]
        for event, life, others, lock, reason in variants:
            self.assertEqual(codex.redemption_decision("alpha", event, rates, life, others, lock, now)["reason"], reason)
        near = rate_snapshot(now, credits)["rateLimits"]
        near["rateLimits"]["secondary"]["resetsAt"] = now + 100
        self.assertEqual(codex.redemption_decision("alpha", {"type": "terminal_limit"}, near, lifecycle, True, True, now)["reason"],
                         "natural-reset-before-drain")
    def test_readback_reconciles_both_windows_and_rejects_ambiguous_effects(self):
        before = rate_snapshot()["rateLimits"]
        after = rate_snapshot()["rateLimits"]
        for key in ("primary", "secondary"): after["rateLimits"][key]["usedPercent"] = 0
        self.assertTrue(codex.reset_readback_verified(before, after))
        after["rateLimits"].pop("secondary")
        self.assertFalse(codex.reset_readback_verified(before, after))
    def test_heartbeat_emits_changes_once_and_respects_hourly_cadence(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = codex.STATE
            codex.STATE = Path(tmp) / "state.json"
            try:
                codex.reconcile(1_000_000, 0, lambda _: rate_snapshot())
                self.assertFalse(codex.reconcile(1_000_001, 3600, lambda _: rate_snapshot())["reconciled"])
                codex.reconcile(1_003_601, 3600, lambda _: rate_snapshot())
                self.assertEqual(len((Path(tmp) / "capacity-events.jsonl").read_text().splitlines()), len(codex.accounts()))
            finally:
                codex.STATE = saved
    def test_installer_pins_the_hourly_monitor_and_revision_receipt(self):
        self.assertTrue(all(value in (ROOT / "scripts/lanes/install.sh").read_text() for value in ("ledger_cadence=3600", "install-receipt")))

    def test_exhaustion_waits_for_the_latest_depleted_window(self):
        now = 1_000_000
        snapshot = rate_snapshot(now)
        for key in ("primary", "secondary"):
            snapshot["rateLimits"]["rateLimits"][key]["usedPercent"] = 100
        codex.reconcile(now, 0, lambda _: snapshot)
        self.assertEqual(codex.read_state()["alpha"]["exhaustedUntil"], now + 7200)

    def test_reconcile_stamps_the_cadence_when_a_snapshot_is_malformed(self):
        codex.reconcile(1_000_000, 0, lambda _: "not-a-dict")
        result = codex.reconcile(1_000_001, 3600, lambda _: rate_snapshot())
        self.assertFalse(result["reconciled"])
        self.assertIn("alpha", codex.read_state()["_ledger"]["errors"])

    def test_redemption_deadline_uses_every_access_loss_field(self):
        now = 1_000_000
        credits = {"availableCount": 1, "credits": [
            {"id": "c", "status": "available", "resetType": "codexRateLimits", "grantedAt": 1, "expiresAt": None}]}
        rates = rate_snapshot(now, credits)["rateLimits"]
        lifecycle = {"observedSustainableThroughputPerHour": 200, "observedConcurrency": 1, "throughputObservedAt": now}
        event = {"type": "terminal_limit"}
        for field in ({"paymentFailure": True, "graceEndsAt": now + 100},
                      {"canceledAtPeriodEnd": True, "subscriptionEndAt": now + 100}):
            decision = codex.redemption_decision("alpha", event, rates, {**lifecycle, **field}, True, True, now)
            self.assertEqual(decision["reason"], "access-loss-before-drain")

    def test_a_pending_reset_retries_the_same_credit_and_key(self):
        now = time.time()
        before = rate_snapshot()["rateLimits"]
        after = rate_snapshot()["rateLimits"]
        for key in ("primary", "secondary"):
            after["rateLimits"][key]["usedPercent"] = 0
        codex.write_state({"alpha": {"pendingReset": {"creditId": "c1", "idempotencyKey": "k1", "before": before},
                                     "exhaustedUntil": now + 3600}})
        calls = []
        saved = codex.app_server_calls
        codex.app_server_calls = lambda name, requested, **kw: calls.append(requested) or [{"outcome": "alreadyRedeemed"}, after]
        try:
            self.assertTrue(codex.maybe_redeem("alpha", handle=type("H", (), {"closed": False})(), now=now))
        finally:
            codex.app_server_calls = saved
        self.assertEqual(calls[0][0][1], {"creditId": "c1", "idempotencyKey": "k1"})
        entry = codex.read_state()["alpha"]
        self.assertNotIn("pendingReset", entry)
        self.assertNotIn("exhaustedUntil", entry)


class StatusTest(Isolated):
    def test_status_reports_availability_resets_and_health_exit(self):
        now = 1_000_000.0
        state = {"alpha": {"exhaustedUntil": now + 120, "lastKind": "limit", "lastError": "usage limit", "runs": 3}}
        report = codex.status(now=now, state=state)
        self.assertEqual(report["available"], ["beta"])
        self.assertEqual(report["accounts"]["alpha"]["resetsInS"], 120)
        self.assertEqual(report["accounts"]["alpha"]["exhaustedUntil"], "1970-01-12T13:48:40Z")
        self.assertTrue(report["accounts"]["beta"]["available"])
        codex.write_state(state)
        self.assertEqual(codex.main(["health"]), 0)
        # health uses the wall clock: bank both accounts far into the future
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        self.assertEqual(codex.main(["health"]), 1)

    def test_run_without_an_account_is_a_temporary_failure(self):
        codex.write_state({"alpha": {"exhaustedUntil": 10 ** 12}, "beta": {"exhaustedUntil": 10 ** 12}})
        with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt:
            prompt.write("do it")
            prompt.flush()
            self.assertEqual(codex.main(["run", "--prompt-file", prompt.name]), codex.NO_ACCOUNT_EXIT)


class RunTest(Isolated):
    def run_with(self, script: str) -> int:
        codex.ROTATE_PAUSE_S = 0
        fake = codex.ACCOUNTS_ROOT.parent / "bin"
        fake.mkdir(exist_ok=True)
        (fake / "codex").write_text(script)
        (fake / "codex").chmod(0o755)
        saved = os.environ.get("PATH")
        os.environ["PATH"] = f"{fake}:{saved}"
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".md") as prompt, tempfile.TemporaryDirectory() as cwd:
                prompt.write("ship it")
                prompt.flush()
                receipt = Path(cwd) / "provider.jsonl"
                code = codex.main(["run", "--prompt-file", prompt.name, "--receipt-file", str(receipt),
                                   "--cwd", cwd])
                self.lease_events = [row for line in receipt.read_text().splitlines()
                                     if (row := json.loads(line)).get("event") == "account-leased"]
                return code
        finally:
            os.environ["PATH"] = saved

    def test_every_account_spent_banks_all_and_hands_off(self):
        code = self.run_with("#!/bin/sh\ncat >/dev/null\necho 'You have hit your usage limit. Try again in 1 hour.'\nexit 1\n")
        self.assertEqual(code, codex.NO_ACCOUNT_EXIT)
        state = codex.read_state()
        self.assertEqual(sorted(n for n, e in state.items() if e.get("exhaustedUntil")), ["alpha", "beta"])
        self.assertTrue(all(state[n]["lastKind"] == "limit" and state[n]["runs"] == 1 for n in ("alpha", "beta")))

    def test_a_limit_mid_run_rotates_to_the_next_account_and_finishes(self):
        script = ("#!/bin/sh\ncat >/dev/null\n"
                  "if [ \"$(basename \"$CODEX_HOME\")\" = alpha ]; then echo 'error: 429 Too Many Requests'; exit 1; fi\n"
                  "echo OK\nexit 0\n")
        self.assertEqual(self.run_with(script), 0)
        state = codex.read_state()
        self.assertEqual(state["alpha"]["lastKind"], "rate")
        self.assertLess(state["alpha"]["exhaustedUntil"] - time.time(), codex.DEFAULT_COOLDOWN_S)
        self.assertEqual(state["beta"]["lastKind"], "ok")
        self.assertNotIn("exhaustedUntil", state["beta"])
        self.assertEqual([row["account"] for row in self.lease_events], ["alpha", "beta"])
        self.assertTrue(all(row["schema"] == "jovie-provider-lease/v1" and
                            row["accountClass"] == "chatgpt-oauth" and
                            row["event"] == "account-leased" for row in self.lease_events))


class CompletionBankTest(Isolated):
    """Order overlapping runs deterministically through the real locked state writer."""
    START = 1_000_000.0

    def setUp(self):
        super().setUp()
        self.clock = self.START
        self.patchers = [
            patch.dict(os.environ, {"CODEX_LANE_AUTH_MODE": "current-login",
                                    "CODEX_LANE_LOGIN_SLOTS": "2",
                                    "CODEX_HOME": str(Path(self.tmp.name) / "login")}),
            patch.object(codex.time, "time", side_effect=lambda: self.clock),
            patch.object(codex, "maybe_redeem", side_effect=AssertionError("no reset credit authority")),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.receipt = Path(self.tmp.name) / "provider.jsonl"

    def complete(self, output="OK\n", code=0, during_wait=None, account="current-login"):
        handle = codex.lease(account)
        self.assertIsNotNone(handle, "two overlapping runs must hold distinct native slots")
        def wait():
            if during_wait:
                during_wait()
            return code
        proc = SimpleNamespace(pid=123, stdin=io.StringIO(), stdout=io.StringIO(output), wait=wait)
        with patch.object(codex.subprocess, "Popen", return_value=proc), redirect_stdout(io.StringIO()):
            result = codex.run_account(account, handle, ["fake-codex"], "fixture", self.tmp.name,
                                       self.clock, str(self.receipt))
        self.assertTrue(handle.closed)
        return result

    def diagnostic(self, account="current-login"):
        row = codex.read_state()[account]
        return {key: row.get(key) for key in ("exhaustedUntil", "lastKind", "lastError", "lastExit", "lastRunAt")}

    def test_success_and_limit_overlap_in_both_completion_orders(self):
        for limit_first in (True, False):
            with self.subTest(limit_first=limit_first):
                codex.write_state({})
                self.clock = self.START
                inner = []
                def second():
                    self.clock += 1
                    inner.append(self.complete("usage limit. Try again in 1 hour.\n" if limit_first else "OK\n",
                                               1 if limit_first else 0))
                    self.clock += 1
                outer = self.complete("OK\n" if limit_first else "usage limit. Try again in 1 hour.\n",
                                      0 if limit_first else 1, second)
                self.assertEqual(outer[:2], (0, "ok") if limit_first else (1, "limit"))
                self.assertEqual(inner[0][:2], (1, "limit") if limit_first else (0, "ok"))
                row = codex.read_state()["current-login"]
                banked_at = self.START + (1 if limit_first else 2)
                self.assertEqual(self.diagnostic(), {"exhaustedUntil": banked_at + 3600,
                    "lastKind": "limit", "lastError": "usage limit", "lastExit": 1, "lastRunAt": banked_at})
                self.assertEqual(row["runs"], 2)
                self.assertEqual(row["lastUsed"], self.START + 1)
                self.assertFalse(codex.available("current-login", codex.read_state(), self.clock))
                events = [json.loads(line) for line in self.receipt.read_text().splitlines()]
                self.assertEqual(len([e for e in events if e["event"] == "account-leased"]), 2)
                self.assertEqual(len([e for e in events if e["event"] == "cli-launch"]), 2)
                self.receipt.unlink()

    def test_failure_cannot_shorten_a_longer_bank_in_either_order(self):
        for longer_first in (True, False):
            with self.subTest(longer_first=longer_first):
                codex.write_state({})
                self.clock = self.START
                def second():
                    self.clock += 1
                    self.complete("usage limit. Try again in 2 hours.\n" if longer_first else
                                  "error: 429 Too Many Requests\n", 1)
                    self.clock += 1
                self.complete("error: 429 Too Many Requests\n" if longer_first else
                              "usage limit. Try again in 2 hours.\n", 1, second)
                banked_at = self.START + (1 if longer_first else 2)
                self.assertEqual(self.diagnostic(), {"exhaustedUntil": banked_at + 7200,
                    "lastKind": "limit", "lastError": "usage limit", "lastExit": 1, "lastRunAt": banked_at})
                self.assertEqual(codex.read_state()["current-login"]["runs"], 2)

    def test_active_auth_bank_and_evidence_survive_success_or_generic_error(self):
        for code in (0, 1):
            with self.subTest(code=code):
                codex.write_state({})
                observed = []
                def auth_failure():
                    self.complete("401 Unauthorized\n", 1)
                    observed.append(self.diagnostic())
                self.complete("ordinary output\n", code, auth_failure)
                self.assertEqual(self.diagnostic(), observed[0])
                self.assertEqual(observed[0]["lastKind"], "auth")
                self.assertEqual(observed[0]["exhaustedUntil"], self.clock + 86400)

    def test_expired_bank_clears_at_reset_boundary_but_not_before(self):
        for offset in (-1, 0, 1):
            with self.subTest(offset=offset):
                until = self.START + 100
                bank = {"exhaustedUntil": until, "lastKind": "limit", "lastError": "usage limit",
                        "lastExit": 1, "lastRunAt": self.START - 1}
                codex.write_state({"current-login": bank})
                self.clock = until + offset
                self.assertEqual(self.complete(), (0, "ok", None))
                row = codex.read_state()["current-login"]
                if offset < 0:
                    self.assertEqual(self.diagnostic(), bank)
                else:
                    self.assertNotIn("exhaustedUntil", row)
                    self.assertNotIn("lastError", row)
                    self.assertEqual((row["lastKind"], row["lastExit"], row["lastRunAt"]), ("ok", 0, self.clock))

    def test_explicit_auth_reverification_can_clear_the_bank(self):
        codex.write_state({"current-login": {"exhaustedUntil": self.START + 86400,
                                            "lastKind": "auth", "lastError": "401"}})
        def reverify():
            with patch.object(codex, "current_login_available", return_value=True):
                codex.reverify_auth_bank(codex.read_state(), self.clock)
        self.complete(during_wait=reverify)
        row = codex.read_state()["current-login"]
        self.assertNotIn("exhaustedUntil", row)
        self.assertNotIn("lastError", row)
        self.assertEqual(row["authReverifiedAt"], self.clock)
        self.assertEqual(row["lastKind"], "ok")

    def test_equal_reset_window_keeps_the_original_failure_attribution(self):
        bank = {"exhaustedUntil": self.START + 3600, "lastKind": "limit", "lastError": "usage limit",
                "lastExit": 7, "lastRunAt": self.START - 1}
        codex.write_state({"current-login": bank})
        self.complete("error: 429 Too Many Requests. Try again in 1 hour.\n", 1)
        self.assertEqual(self.diagnostic(), bank)

    def test_independent_account_success_does_not_change_another_bank(self):
        bank = {"exhaustedUntil": self.START + 3600, "lastKind": "limit", "lastError": "usage limit"}
        codex.write_state({"alpha": bank})
        self.complete(account="beta")
        state = codex.read_state()
        self.assertEqual(state["alpha"], bank)
        self.assertEqual(state["beta"]["lastKind"], "ok")
        self.assertNotIn("exhaustedUntil", state["beta"])


class SubscriptionPoolTest(Isolated):
    NOW = 1_000_000

    def setUp(self):
        super().setUp()
        import hashlib
        self.homes = {"current-login": (Path(self.tmp.name) / "active").resolve(),
                      "lyb-pro": (Path(self.tmp.name) / "staged").resolve()}
        self.emails = {"current-login": "primary@example.invalid", "lyb-pro": "extra@example.invalid"}
        for home in self.homes.values():
            home.mkdir()
        self.profiles = {name: {"home": str(home), "slots": 3 if name == "current-login" else 1,
                               "emailSha256": hashlib.sha256(self.emails[name].encode()).hexdigest()}
                         for name, home in self.homes.items()}
        self.env = patch.dict(os.environ, {"CODEX_LANE_AUTH_MODE": "subscription-pool",
            "CODEX_LANE_SUBSCRIPTION_PROFILES": json.dumps(self.profiles), "CODEX_LANE_LOGIN_SLOTS": "3",
            "CODEX_HOME": str(self.homes["current-login"]), "OPENAI_API_KEY": "must-not-reach-child",
            "OPENAI_BASE_URL": "https://forbidden.invalid", "CODEX_API_KEY": "must-not-reach-child"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.clock = patch.object(codex.time, "time", return_value=self.NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        compute = patch.object(codex.os, "cpu_count", return_value=8)
        compute.start()
        self.addCleanup(compute.stop)

    def primary_slots(self, count):
        profiles = {name: dict(profile) for name, profile in self.profiles.items()}
        profiles["current-login"]["slots"] = count
        return patch.dict(os.environ, {"CODEX_LANE_SUBSCRIPTION_PROFILES": json.dumps(profiles),
                                       "CODEX_LANE_LOGIN_SLOTS": str(count)})

    def test_explicit_primary_seats_accept_known_compute_without_a_fixed_three_ceiling(self):
        for count in (1, 3, 4, 8):
            with self.subTest(count=count), self.primary_slots(count):
                self.assertEqual(codex.login_slots("current-login"), count)
                self.assertEqual(codex.login_slots("lyb-pro"), 1)

    def test_unknown_or_insufficient_compute_refuses_the_pool_before_any_lease(self):
        for cpus in (None, 0, -1, True, 4.0, "4", 3):
            with self.subTest(cpus=cpus), self.primary_slots(4), \
                    patch.object(codex.os, "cpu_count", return_value=cpus), \
                    patch.object(codex, "update_state", side_effect=AssertionError("no binding write")):
                with self.assertRaises(ValueError):
                    codex.lease("current-login")

    def test_primary_seat_types_bounds_and_configuration_agreement_remain_strict(self):
        for count in (0, -1, True, 4.0, "4", 9, 10**100):
            with self.subTest(count=count), self.primary_slots(count):
                with self.assertRaises(ValueError):
                    codex.subscription_profiles()
        with self.primary_slots(4), patch.dict(os.environ, {"CODEX_LANE_LOGIN_SLOTS": "3"}):
            with self.assertRaisesRegex(ValueError, "slots must remain unchanged"):
                codex.subscription_profiles()

    def test_four_primary_flocks_and_one_exclusive_extra_share_existing_lock_namespace(self):
        with self.primary_slots(4):
            self.reconcile()
            handles = [codex.lease("current-login") for _ in range(4)] + [codex.lease("lyb-pro")]
            try:
                self.assertTrue(all(handles))
                self.assertIsNone(codex.lease("current-login"))
                self.assertIsNone(codex.lease("lyb-pro"))
                self.assertEqual([Path(handle.name).name for handle in handles],
                                 ["current-login.lock", "current-login.1.lock", "current-login.2.lock",
                                  "current-login.3.lock", "lyb-pro.lock"])
                with patch.dict(os.environ, {"CODEX_LANE_AUTH_MODE": "current-login"}):
                    self.assertIsNone(codex.lease("current-login"))
            finally:
                for handle in handles:
                    if handle is not None:
                        handle.close()
            self.assertEqual([len(codex._slot_paths(name)) for name in self.profiles], [4, 1])

    def test_widened_primary_quota_bank_stops_execution_and_all_new_primary_picks(self):
        with self.primary_slots(4):
            self.reconcile()
            value = self.snapshot("current-login")
            value["rateLimits"]["rateLimits"]["primary"]["usedPercent"] = 100
            handle = codex.lease("current-login")
            with patch.object(codex, "current_subscription_snapshot", return_value=value), \
                    patch.object(codex.subprocess, "Popen", side_effect=AssertionError("no depleted execution")):
                self.assertEqual(codex.run_account("current-login", handle, ["fake"], "fixture",
                                                  self.tmp.name, self.NOW),
                                 (codex.NO_ACCOUNT_EXIT, "limit", self.NOW + 7200))
            self.assertTrue(handle.closed)
            state = codex.read_state()
            self.assertEqual(codex.pick(state, self.NOW, ["current-login"]), (None, None))
            self.assertTrue(codex.available("lyb-pro", state, self.NOW))
            self.assertEqual(state["current-login"]["exhaustedUntil"], self.NOW + 7200)

    def test_primary_seat_capacity_never_bypasses_native_global_or_provider_admission(self):
        from scripts.lanes import lane_runner as runner
        with self.primary_slots(4):
            self.reconcile()
            host = runner.Host(repo=Path(self.tmp.name), state=Path(self.tmp.name) / "worker-state")
            occupied = [runner.Locked(host.state / "slots" / f"codex.{index}.lock", False)
                        for index in range(4)]
            other = runner.Locked(host.state / "slots/grok.0.lock", False)
            for lock in [*occupied, other]:
                self.assertTrue(lock.held)
                self.addCleanup(lambda lock=lock: lock.release() if not lock.handle.closed else None)
            providers = {"codex": {"enabled": True, "slots": 5}, "grok": {"enabled": True, "slots": 1}}
            def admitted(_host, name, _spec, slot, **_):
                self.assertEqual(name, "codex")
                self.assertTrue(slot.held)
                self.assertEqual(sum(runner.occupied_worker_slots(host).values()), 5)
                account = codex.lease("current-login")
                self.assertIsNotNone(account)
                account.close()
                return 0
            with patch.object(runner, "load_providers", return_value=providers), \
                    patch.object(host, "slots", return_value=5) as provider_cap, \
                    patch.object(host, "intake_slots", return_value=5), \
                    patch.object(runner.autoscale, "host_ceiling", return_value=5) as global_cap, \
                    patch.object(runner, "worker_with_slot", side_effect=admitted) as work:
                self.assertEqual(runner.worker(host, "codex"), 0)  # Other providers consume the same ceiling.
                work.assert_not_called()
                other.release()
                global_cap.return_value = 4
                self.assertEqual(runner.worker(host, "codex"), 0)
                work.assert_not_called()
                global_cap.return_value = 5
                provider_cap.return_value = 4
                self.assertEqual(runner.worker(host, "codex"), 0)
                work.assert_not_called()
                provider_cap.return_value = 5
                self.assertEqual(runner.worker(host, "codex"), 0)
                work.assert_called_once()


    @patch.object(codex, "current_login_available", return_value=True)
    def test_health_keeps_eligible_fully_leased_subscriptions_healthy(self, _login):
        self.reconcile()
        handles = [codex.lease("current-login") for _ in range(3)] + [codex.lease("lyb-pro")]
        try:
            self.assertTrue(all(handles))
            before = codex.read_state()
            report = codex.status()
            self.assertEqual(report["available"], [])
            self.assertTrue(all(row["available"] and row["freeSlots"] == 0
                                for row in report["accounts"].values()))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(codex.main(["health"]), 0)
            self.assertEqual(codex.read_state(), before)
            self.assertEqual(codex.status(), report)
        finally:
            for handle in handles:
                if handle is not None:
                    handle.close()

    @patch.object(codex, "current_login_available", return_value=True)
    def test_health_rejects_unverified_stale_banked_and_depleted_accounts(self, _login):
        self.reconcile()
        verified = codex.read_state()
        mutations = {
            "unknown": lambda row: row.pop("subscriptionIdentityVerifiedAt"),
            "stale": lambda row: row.update(subscriptionIdentityVerifiedAt=self.NOW - codex.LEDGER_CADENCE_S),
            "binding": lambda row: row.update(subscriptionBinding="unknown"),
            "auth": lambda row: row.update(lastKind="auth", exhaustedUntil=self.NOW + 60),
            "quota": lambda row: row.update(lastKind="limit", exhaustedUntil=self.NOW + 60),
            "depleted": lambda row: row["capacityLease"]["usableCapacityRemaining"]["primary"].update(remainingPercent=0),
            "expired": lambda row: row["capacityLease"]["usableCapacityRemaining"]["primary"].update(resetsAt=self.NOW),
            "missing-capacity": lambda row: row.pop("capacityLease"),
        }
        for reason, mutate in mutations.items():
            with self.subTest(reason=reason):
                state = json.loads(json.dumps(verified))
                for name in self.profiles:
                    mutate(state[name])
                codex.write_state(state)
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(codex.main(["health"]), 1)
                self.assertEqual(codex.status()["available"], [])
                self.assertEqual(codex.read_state(), state)

    @patch.object(codex, "current_login_available", return_value=True)
    def test_health_accepts_busy_eligible_account_when_free_account_is_stale(self, _login):
        self.reconcile()
        state = codex.read_state()
        state["current-login"]["subscriptionIdentityVerifiedAt"] = self.NOW - codex.LEDGER_CADENCE_S
        codex.write_state(state)
        handle = codex.lease("lyb-pro")
        self.assertIsNotNone(handle)
        try:
            report = codex.status()
            self.assertEqual(report["available"], [])
            self.assertFalse(report["accounts"]["current-login"]["available"])
            self.assertEqual(report["accounts"]["current-login"]["freeSlots"], 3)
            self.assertTrue(report["accounts"]["lyb-pro"]["available"])
            self.assertEqual(report["accounts"]["lyb-pro"]["freeSlots"], 0)
            with redirect_stdout(io.StringIO()):
                self.assertEqual(codex.main(["health"]), 0)
        finally:
            handle.close()

    @patch.object(codex, "current_login_available", return_value=True)
    def test_health_without_accounts_fails(self, _login):
        self.reconcile()
        _login.return_value = False
        with redirect_stdout(io.StringIO()):
            self.assertEqual(codex.main(["health"]), 1)

    def snapshot(self, name):
        value = current_snapshot(self.NOW)
        value["account"]["account"].update(email=self.emails[name], planType="pro")
        return value

    def reconcile(self):
        return codex.reconcile(self.NOW, if_due=0, fetch=self.snapshot)

    def execute(self, name="lyb-pro", output="OK\n", code=0):
        handle = codex.lease(name)
        self.assertIsNotNone(handle)
        descriptor = handle.fileno()
        proc = SimpleNamespace(pid=123, stdin=io.StringIO(), stdout=io.StringIO(output), wait=lambda: code)
        with patch.object(codex, "current_subscription_snapshot", side_effect=lambda name, **_: self.snapshot(name)), \
                patch.object(codex.subprocess, "Popen", return_value=proc) as spawn, redirect_stdout(io.StringIO()):
            result = codex.run_account(name, handle, ["fake"], "fixture", self.tmp.name, self.NOW)
        self.assertTrue(handle.closed)
        return result, spawn.call_args, descriptor

    def test_invalid_configuration_fails_closed_without_discovery(self):
        invalid = ["", "[]", "{}", "null", "{bad"]
        for mutate in (lambda p: p.pop("current-login"),
                       lambda p: p.update(third=p["lyb-pro"]),
                       lambda p: p.update({"current-login.1": p.pop("lyb-pro")}),
                       lambda p: p.update({"_ledger": p.pop("lyb-pro")}),
                       lambda p: p["lyb-pro"].update(home=p["current-login"]["home"]),
                       lambda p: p["lyb-pro"].update(emailSha256=p["current-login"]["emailSha256"]),
                       lambda p: p["lyb-pro"].update(slots=2),
                       lambda p: p["lyb-pro"].update(slots=True),
                       lambda p: p["current-login"].update(slots=2),
                       lambda p: p["current-login"].update(home=p["lyb-pro"]["home"]),
                       lambda p: p["lyb-pro"].update(home="relative"),
                       lambda p: p["lyb-pro"].update(home=str(Path(self.tmp.name) / "absent")),
                       lambda p: p["lyb-pro"].update(emailSha256="unknown"),
                       lambda p: p["lyb-pro"].update(credential="forbidden")):
            value = json.loads(json.dumps(self.profiles)); mutate(value); invalid.append(json.dumps(value))
        with patch.object(codex, "current_login_available", side_effect=AssertionError("invalid config must not probe")):
            for raw in invalid:
                with self.subTest(raw=raw), patch.dict(os.environ, {"CODEX_LANE_SUBSCRIPTION_PROFILES": raw}):
                    with self.assertRaises(ValueError):
                        codex.accounts()

    def test_three_primary_plus_one_extra_preserve_existing_slot_paths(self):
        self.reconcile()
        handles = [codex.lease("current-login") for _ in range(3)] + [codex.lease("lyb-pro")]
        try:
            self.assertTrue(all(handles))
            self.assertIsNone(codex.lease("current-login"))
            self.assertIsNone(codex.lease("lyb-pro"))
            self.assertEqual([Path(h.name).name for h in handles],
                             ["current-login.lock", "current-login.1.lock", "current-login.2.lock", "lyb-pro.lock"])
            report = codex.status(self.NOW, names=list(self.profiles))
            self.assertEqual([r["freeSlots"] for r in report["accounts"].values()], [0, 0])
            with patch.dict(os.environ, {"CODEX_LANE_AUTH_MODE": "current-login"}):
                self.assertIsNone(codex.lease("current-login"), "old and pool workers must contend on the same locks")
        finally:
            for handle in handles: handle.close()
        self.assertEqual([len(codex._slot_paths(n)) for n in self.profiles], [3, 1])

    def test_reconciliation_keeps_independent_cadence_and_banks(self):
        bank = {"exhaustedUntil": self.NOW + 100, "lastKind": "limit", "lastError": "usage limit", "runs": 2}
        codex.write_state({"current-login": bank})
        busy = codex.lease("lyb-pro")
        try:
            result = self.reconcile()
            self.assertTrue(result["profiles"]["current-login"]["reconciled"])
            self.assertEqual(result["profiles"]["lyb-pro"]["reason"], "account-lease-busy")
        finally:
            busy.close()
        with patch.object(codex, "current_subscription_snapshot", side_effect=lambda name, **_: self.snapshot(name)) as fetch:
            result = codex.reconcile(self.NOW)
        self.assertEqual([call.args[0] for call in fetch.call_args_list], ["lyb-pro"])
        self.assertEqual(result["profiles"]["current-login"]["reason"], "cadence")
        row = codex.read_state()["current-login"]
        self.assertTrue(all(row[key] == value for key, value in bank.items()))
        self.assertTrue(codex.available("lyb-pro", codex.read_state(), self.NOW))
        self.assertFalse(codex.available("lyb-pro", codex.read_state(), self.NOW + codex.LEDGER_CADENCE_S))

    def test_unknown_identity_capacity_and_rebinding_are_not_available(self):
        self.assertFalse(codex.available("lyb-pro", {}, self.NOW))
        self.reconcile()
        for mutate in (lambda r: r.pop("subscriptionBinding"),
                       lambda r: r["subscriptionBinding"].update(home="/other"),
                       lambda r: r.update(subscriptionIdentityVerifiedAt=self.NOW+1),
                       lambda r: r.update(capacityLease={}),
                       lambda r: r["capacityLease"]["usableCapacityRemaining"]["primary"].update(remainingPercent=0)):
            state = codex.read_state(); mutate(state["lyb-pro"])
            self.assertFalse(codex.available("lyb-pro", state, self.NOW))
        row = codex.read_state()["lyb-pro"]; row["subscriptionBinding"]["home"] = "/prior"
        codex.write_state({"lyb-pro": row})
        with self.assertRaisesRegex(ValueError, "rebound"):
            codex.lease("lyb-pro")

    def test_wrong_account_plan_or_missing_identity_cannot_execute(self):
        self.reconcile()
        for account in ({"type":"apiKey"}, {"type":"chatgpt","email":None,"planType":"pro"},
                        {"type":"chatgpt","email":"wrong@example.invalid","planType":"pro"},
                        {"type":"chatgpt","email":self.emails["lyb-pro"],"planType":"plus"}):
            with self.subTest(account=account):
                value = self.snapshot("lyb-pro"); value["account"]["account"] = account
                handle = codex.lease("lyb-pro")
                with patch.object(codex, "current_subscription_snapshot", return_value=value), \
                        patch.object(codex.subprocess, "Popen", side_effect=AssertionError("must not execute")):
                    with self.assertRaises(ValueError):
                        codex.run_account("lyb-pro", handle, ["fake"], "fixture", self.tmp.name, self.NOW)
                self.assertTrue(handle.closed)
                self.assertNotIn("runs", codex.read_state()["lyb-pro"])

    def test_execution_pins_profile_home_strips_api_credentials_and_inherits_lease(self):
        self.reconcile()
        result, call, descriptor = self.execute()
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(call.kwargs["env"]["CODEX_HOME"], str(self.homes["lyb-pro"]))
        self.assertFalse({"OPENAI_API_KEY","OPENAI_BASE_URL","CODEX_API_KEY"}.intersection(call.kwargs["env"]))
        self.assertEqual(call.kwargs["pass_fds"], (descriptor,))

    def test_no_same_run_rotation_or_credit_redemption_after_limit(self):
        self.reconcile()
        busy = [codex.lease("current-login") for _ in range(3)]
        prompt = Path(self.tmp.name) / "prompt.txt"; prompt.write_text("fixture")
        proc = SimpleNamespace(pid=123, stdin=io.StringIO(), stdout=io.StringIO("usage limit. Try again in 1 hour.\n"), wait=lambda:1)
        try:
            with patch.object(codex, "current_login_available", return_value=True), \
                    patch.object(codex, "current_subscription_snapshot", side_effect=lambda name, **_: self.snapshot(name)), \
                    patch.object(codex, "maybe_redeem", side_effect=AssertionError("no reset authority")), \
                    patch.object(codex.subprocess, "Popen", return_value=proc) as spawn, redirect_stdout(io.StringIO()):
                code = codex.run(SimpleNamespace(prompt_file=str(prompt),cwd=self.tmp.name,model=None,reasoning_effort=None))
            self.assertEqual(code, codex.NO_ACCOUNT_EXIT)
            self.assertEqual(spawn.call_count, 1)
            argv = spawn.call_args.args[0]
            self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
            self.assertIn('approvals_reviewer="auto_review"', argv)
            self.assertIn('model_provider="openai"', argv)
            self.assertIn('forced_login_method="chatgpt"', argv)
        finally:
            for handle in busy: handle.close()

    def test_metadata_transport_rejects_wrong_lease_and_nonpublic_calls(self):
        handle = codex.lease("current-login")
        try:
            for name,calls in (("lyb-pro",codex.CURRENT_METADATA_CALLS),
                               ("current-login",[("account/rateLimitResetCredit/consume",{})])):
                with self.subTest(name=name), patch.object(codex.subprocess,"Popen",side_effect=AssertionError("no probe")):
                    with self.assertRaises(ValueError):codex.app_server_calls(name,calls,lease_handle=handle)
            with patch.dict(os.environ,{"CODEX_LANE_SUBSCRIPTION_PROFILES":json.dumps({
                    **self.profiles,"lyb-pro":{**self.profiles["lyb-pro"],"emailSha256":"a"*64}})}):
                # A change to an unrelated profile does not change this bound current lease.
                self.assertEqual(codex.leased_profile("current-login",handle),self.profiles["current-login"])
        finally:handle.close()

    def test_verified_depletion_banks_only_that_account_without_execution(self):
        self.reconcile()
        value = self.snapshot("lyb-pro")
        value["rateLimits"]["rateLimits"]["primary"]["usedPercent"] = 100
        handle = codex.lease("lyb-pro")
        with patch.object(codex,"current_subscription_snapshot",return_value=value), \
                patch.object(codex.subprocess,"Popen",side_effect=AssertionError("no exhausted execution")):
            self.assertEqual(codex.run_account("lyb-pro",handle,["fake"],"fixture",self.tmp.name,self.NOW),
                             (codex.NO_ACCOUNT_EXIT,"limit",self.NOW+7200))
        self.assertTrue(codex.available("current-login",codex.read_state(),self.NOW))
        self.assertFalse(codex.available("lyb-pro",codex.read_state(),self.NOW))

    def test_failed_observation_keeps_its_own_cadence_without_suppressing_other_profile(self):
        seen = []
        def fetch(name):
            seen.append(name)
            if name == "current-login": raise ValueError("unavailable")
            return self.snapshot(name)
        result = codex.reconcile(self.NOW,fetch=fetch)
        self.assertFalse(result["profiles"]["current-login"]["reconciled"])
        self.assertTrue(result["profiles"]["lyb-pro"]["reconciled"])
        codex.reconcile(self.NOW,fetch=fetch)
        self.assertEqual(seen,["current-login","lyb-pro"])

    def test_identity_evidence_refreshes_before_it_lapses_and_a_failed_refresh_recovers(self):
        # Gem 2026-10-20: a metadata timeout throttled the next attempt for a whole cadence,
        # identity evidence lapsed on both accounts and the lane read "all-accounts-banked"
        # with 99% capacity left. Refresh must start before the lapse and retry quickly.
        calls = []
        def fetch_at(at, fail=False):
            def fetch(name):
                calls.append((at, name))
                if fail:
                    raise TimeoutError("public subscription metadata unavailable")
                value = current_snapshot(at)
                value["account"]["account"].update(email=self.emails[name], planType="pro")
                return value
            return fetch
        codex.reconcile(self.NOW, fetch=fetch_at(self.NOW))
        lead = self.NOW + codex.LEDGER_CADENCE_S - codex.SUBSCRIPTION_REFRESH_LEAD_S
        codex.reconcile(lead - 1, fetch=fetch_at(lead - 1))
        self.assertEqual([at for at, _ in calls], [self.NOW, self.NOW], "fresh evidence keeps the cadence")
        codex.reconcile(lead, fetch=fetch_at(lead, fail=True))
        self.assertEqual(calls[2:], [(lead, "current-login"), (lead, "lyb-pro")])
        codex.reconcile(lead + 1, fetch=fetch_at(lead + 1))
        self.assertEqual(len(calls), 4, "a failed refresh is never hot-looped")
        state = codex.read_state()
        self.assertTrue(all(codex.available(name, state, lead) for name in self.profiles))
        retry = lead + codex.SUBSCRIPTION_RETRY_S
        result = codex.reconcile(retry, fetch=fetch_at(retry))
        self.assertTrue(all(row["reconciled"] for row in result["profiles"].values()))
        lapsed = self.NOW + codex.LEDGER_CADENCE_S + 60
        state = codex.read_state()
        self.assertTrue(all(codex.available(name, state, lapsed) for name in self.profiles))
        self.assertLess(retry, self.NOW + codex.LEDGER_CADENCE_S)

    def test_auth_bank_clears_only_after_newer_bound_official_identity_observation(self):
        self.reconcile()
        for failed_at,verified_at,clears in ((self.NOW-1,self.NOW,True),
                (self.NOW,self.NOW,False),(self.NOW+1,self.NOW,False),
                (self.NOW-4000,self.NOW-3600,False)):
            with self.subTest(failed_at=failed_at,verified_at=verified_at):
                state=codex.read_state()
                state["lyb-pro"].update(exhaustedUntil=self.NOW+86400,lastKind="auth",lastRunAt=failed_at,
                                        lastError="401",subscriptionIdentityVerifiedAt=verified_at)
                state["current-login"].update(exhaustedUntil=self.NOW+3600,lastKind="limit")
                codex.write_state(state)
                result=codex.reverify_auth_bank(state,self.NOW)
                self.assertEqual("exhaustedUntil" not in result["lyb-pro"],clears)
                self.assertEqual(result["current-login"]["exhaustedUntil"],self.NOW+3600)

    def test_changed_selected_profile_cannot_cross_lease_to_execution(self):
        self.reconcile()
        handle=codex.lease("lyb-pro")
        changed=json.loads(json.dumps(self.profiles));changed["lyb-pro"]["emailSha256"]="b"*64
        with patch.dict(os.environ,{"CODEX_LANE_SUBSCRIPTION_PROFILES":json.dumps(changed)}), \
                patch.object(codex.subprocess,"Popen",side_effect=AssertionError("must not spawn")):
            with self.assertRaises(ValueError):codex.run_account("lyb-pro",handle,["fake"],"fixture",self.tmp.name,self.NOW)
        self.assertTrue(handle.closed)

    def test_child_inherited_descriptor_keeps_exclusive_extra_lease_after_parent_close(self):
        import subprocess
        handle=codex.lease("lyb-pro")
        child=subprocess.Popen([sys.executable,"-c","import sys; print('ready',flush=True); sys.stdin.read()"],
                               stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,pass_fds=(handle.fileno(),))
        try:
            self.assertEqual(child.stdout.readline().strip(),"ready")
            handle.close()
            self.assertIsNone(codex.lease("lyb-pro"))
        finally:
            child.stdin.close();child.wait(timeout=5);child.stdout.close()
            if not handle.closed:handle.close()
        again=codex.lease("lyb-pro");self.assertIsNotNone(again);again.close()

    def test_invalid_or_expired_public_capacity_never_spawns(self):
        self.reconcile()
        for mutate in (lambda v:v["rateLimits"].update(rateLimits={}),
                       lambda v:v["rateLimits"]["rateLimits"]["primary"].update(usedPercent=float("nan")),
                       lambda v:v["rateLimits"]["rateLimits"]["primary"].update(resetsAt=self.NOW)):
            value=self.snapshot("lyb-pro");mutate(value);handle=codex.lease("lyb-pro")
            with patch.object(codex,"current_subscription_snapshot",return_value=value), \
                    patch.object(codex.subprocess,"Popen",side_effect=AssertionError("no execution")):
                with self.assertRaises(ValueError):codex.run_account("lyb-pro",handle,["fake"],"fixture",self.tmp.name,self.NOW)
            self.assertTrue(handle.closed)

    def test_renaming_an_account_cannot_bypass_its_live_lease_or_bank(self):
        self.reconcile()
        handle=codex.lease("lyb-pro")
        codex.update_state(lambda state:state["lyb-pro"].update(exhaustedUntil=self.NOW+86400,lastKind="auth"))
        changed=json.loads(json.dumps(self.profiles));changed["renamed-pro"]=changed.pop("lyb-pro")
        try:
            with patch.dict(os.environ,{"CODEX_LANE_SUBSCRIPTION_PROFILES":json.dumps(changed)}):
                with self.assertRaisesRegex(ValueError,"another alias"):
                    codex.lease("renamed-pro")
                self.assertNotIn("renamed-pro",codex.read_state())
                self.assertEqual(codex.read_state()["lyb-pro"]["exhaustedUntil"],self.NOW+86400)
        finally:handle.close()

    def test_new_alias_identity_reservation_is_atomic_before_any_execution_lease(self):
        # Even an unreconciled native lease binds the identity permanently.
        handle=codex.lease("lyb-pro")
        changed=json.loads(json.dumps(self.profiles));changed["renamed-pro"]=changed.pop("lyb-pro")
        try:
            with patch.dict(os.environ,{"CODEX_LANE_SUBSCRIPTION_PROFILES":json.dumps(changed)}):
                with self.assertRaises(ValueError):codex.lease("renamed-pro")
        finally:handle.close()

    def test_natural_reset_refreshes_once_and_failed_refresh_retains_hourly_throttle(self):
        def near_reset(name):
            value=self.snapshot(name)
            if name=="lyb-pro":value["rateLimits"]["rateLimits"]["primary"]["resetsAt"]=self.NOW+30
            return value
        codex.reconcile(self.NOW,fetch=near_reset)
        self.assertFalse(codex.available("lyb-pro",codex.read_state(),self.NOW+31))
        seen=[]
        def refresh(name):seen.append(name);return self.snapshot(name)
        result=codex.reconcile(self.NOW+31,fetch=refresh)
        self.assertEqual(seen,["lyb-pro"])
        self.assertTrue(result["profiles"]["lyb-pro"]["reconciled"])
        self.assertTrue(codex.available("lyb-pro",codex.read_state(),self.NOW+31))
        codex.write_state({});codex.reconcile(self.NOW,fetch=near_reset)
        seen=[]
        def fail(name):seen.append(name);raise ValueError("unavailable")
        codex.reconcile(self.NOW+31,fetch=fail);codex.reconcile(self.NOW+32,fetch=fail)
        self.assertEqual(seen,["lyb-pro"])


class LaunchIdentityTest(Isolated):
    """Exercise the real pipe/receipt boundary with a model-free CLI stand-in."""
    SESSION = "01a10a2c-4cd3-7150-b5dd-575434d84155"
    OTHER_SESSION = "01a10a2d-ef53-7272-867c-8997a1de59ab"

    def header(self, *, model="gpt-5.6-sol", session=None, cwd=None, version="0.147.0"):
        return (f"OpenAI Codex v{version}\n--------\n"
                f"workdir: {cwd or self.tmp.name}\nmodel: {model}\nprovider: openai\n"
                "approval: never\nsandbox: workspace-write\n"
                "reasoning effort: xhigh\nreasoning summaries: none\n"
                f"session id: {session or self.SESSION}\n--------\nuser\n")

    def invoke(self, output, *, account="alpha", code=0, receipt=None, require_launch=True):
        import contextlib
        import io
        from unittest.mock import patch
        root = Path(self.tmp.name)
        script = root / "fake_cli.py"
        script.write_text("import sys\nsys.stdin.read()\nsys.stdout.write(" + repr(output) +
                          ")\nsys.stdout.flush()\nsys.exit(" + str(code) + ")\n")
        receipt = receipt or root / "attempt.provider.jsonl"
        previous = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        prior_launches = sum(row.get("event") == "cli-launch" for row in previous)
        cmd = [sys.executable, "-u", str(script), "-m", "configured-alias", "-c",
               'model_reasoning_effort="high"']
        handle = codex.lease(account)
        with contextlib.redirect_stdout(io.StringIO()), patch.object(codex, "maybe_redeem", return_value=False):
            result = codex.run_account(account, handle, cmd, "private prompt", self.tmp.name,
                                       time.time(), str(receipt))
        rows = [json.loads(line) for line in receipt.read_text().splitlines()]
        launches = [row for row in rows if row.get("event") == "cli-launch"]
        if require_launch:
            self.assertEqual(len(launches), prior_launches + 1,
                             "every spawned CLI must leave a new launch identity or explicit unknown")
        return launches[-1] if launches else None, result

    def test_requested_and_cli_reported_identity_are_separate(self):
        row, result = self.invoke(self.header() + "private prompt\ncodex\nDone\n")
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(row["identityState"], "reported")
        self.assertEqual(row["requested"], {"model": "configured-alias", "provider": None,
                                           "reasoningEffort": "high"})
        self.assertEqual(row["cliReported"], {"model": "gpt-5.6-sol", "provider": "openai",
                                             "reasoningEffort": "xhigh", "sessionId": self.SESSION})
        self.assertEqual(row["provenance"], "codex-cli-startup-header")
        self.assertEqual(row["reasoningEffortSource"], "cli-resolved-configuration")
        self.assertFalse(row["providerAttested"])
        self.assertGreater(row["pid"], 0)
        self.assertEqual(len(row["adapterSha256"]), 64)
        self.assertEqual(row["worktree"], str(Path(self.tmp.name).resolve()))
        self.assertNotIn("private prompt", json.dumps(row))

    def test_observed_previous_cli_header_has_explicit_version_provenance(self):
        row, _ = self.invoke(self.header(version="0.144.6"))
        self.assertEqual(row["identityState"], "reported")
        self.assertEqual(row["cliVersion"], "0.144.6")
        self.assertEqual(row["cliReported"]["model"], "gpt-5.6-sol")
        self.assertFalse(row["providerAttested"])

    def test_latest_verified_cli_header_has_explicit_version_provenance(self):
        # rust-v0.162.1 exec/src/event_processor_with_human_output.rs preserves
        # the pre-prompt header contract; this is CLI evidence, not attestation.
        row, result = self.invoke(self.header(version="0.162.1", model="gpt-6.1-sol"))
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(row["identityState"], "reported")
        self.assertEqual(row["cliVersion"], "0.162.1")
        self.assertEqual(row["cliReported"], {"model": "gpt-6.1-sol", "provider": "openai",
                                             "reasoningEffort": "xhigh", "sessionId": self.SESSION})
        self.assertEqual(row["requested"]["model"], "configured-alias")
        self.assertEqual(row["provenance"], "codex-cli-startup-header")
        self.assertFalse(row["providerAttested"])
        self.assertIsNone(row["usage"])
        self.assertIsNone(row["costUsd"])

    def test_latest_cli_still_rejects_unknown_versions_and_malformed_identity(self):
        header = self.header(version="0.162.1")
        cases = [header.replace("v0.162.1", "v0.162.2"),
                 header.replace("session id: " + self.SESSION, "session id: invalid"),
                 header.replace("provider: openai", "provider: openai SECRET"),
                 header.replace("--------\nuser\n", "--------\n"),
                 "codex\n" + header]
        for index, output in enumerate(cases):
            with self.subTest(index=index):
                row, _ = self.invoke(output)
                self.assertEqual(row["identityState"], "unknown")
                self.assertIsNone(row["cliReported"])
                self.assertFalse(row["providerAttested"])

    def test_missing_malformed_or_incomplete_startup_stays_unknown(self):
        cases = ["", "codex\n" + self.header(),
                 self.header().replace("session id: " + self.SESSION, "session id: not-a-session"),
                 self.header().replace("provider: openai\n", ""),
                 self.header().replace("--------\nuser\n", "--------\n"),
                 self.header().replace("provider: openai", "provider: openai SECRET"),
                 self.header().replace("OpenAI Codex v0.147.0", "untrusted startup"),
                 self.header().replace("OpenAI Codex v0.147.0", "OpenAI Codex v0.148.0"),
                 self.header(cwd="."),
                 self.header().replace("reasoning effort: xhigh", "reasoning effort: invented")]
        for index, output in enumerate(cases):
            with self.subTest(index=index):
                row, _ = self.invoke(output)
                self.assertEqual(row["identityState"], "unknown")
                self.assertIsNone(row["cliReported"])

    def test_output_injection_cannot_replace_a_valid_header(self):
        injected = self.header(model="forged-model", session=self.OTHER_SESSION)
        for source in ("user", "codex", "exec"):
            with self.subTest(source=source):
                row, _ = self.invoke(self.header() + source + "\n" + injected)
                self.assertEqual(row["cliReported"]["model"], "gpt-5.6-sol")
                self.assertEqual(row["cliReported"]["sessionId"], self.SESSION)

    def test_duplicate_or_mismatched_session_header_is_unknown(self):
        header = self.header().replace("session id: " + self.SESSION,
                    "session id: " + self.SESSION + "\nsession id: " + self.OTHER_SESSION)
        row, _ = self.invoke(header)
        self.assertEqual(row["identityState"], "unknown")
        self.assertIsNone(row["cliReported"])

    def test_stale_receipt_and_wrong_worktree_never_supply_current_identity(self):
        first, _ = self.invoke(self.header())
        current, _ = self.invoke(self.header(cwd="/tmp/some-older-worktree"))
        self.assertEqual(current["identityState"], "unknown")
        self.assertIsNone(current["cliReported"])
        self.assertNotEqual(first["launchId"], current["launchId"])

    def test_account_rotation_has_distinct_launch_and_session_bindings(self):
        first, result = self.invoke(self.header() + "error: usage limit reached\n", code=1)
        self.assertEqual(result[1], "limit")
        second, _ = self.invoke(self.header(session=self.OTHER_SESSION), account="beta")
        self.assertEqual((first["account"], second["account"]), ("alpha", "beta"))
        self.assertNotEqual(first["launchId"], second["launchId"])
        self.assertNotEqual(first["cliReported"]["sessionId"], second["cliReported"]["sessionId"])

    def test_unmeasured_usage_and_cost_remain_null(self):
        row, _ = self.invoke(self.header() + "tokens used\n1234\ncost: 9.99\n")
        self.assertIsNone(row["usage"])
        self.assertIsNone(row["costUsd"])

    def test_unbounded_or_unrecognized_header_cannot_resume_parsing(self):
        for output in ("warning\n" * 40 + self.header(),
                       self.header().replace("approval: never", "approval: " + "x" * 20000),
                       self.header().replace("approval: never", "unknown field: ignored")):
            with self.subTest(size=len(output)):
                row, _ = self.invoke(output)
                self.assertEqual(row["identityState"], "unknown")
                self.assertIsNone(row["cliReported"])


    def test_identity_write_failure_does_not_change_child_outcome_or_lease(self):
        import builtins
        import contextlib
        import io
        from unittest.mock import patch
        receipt = Path(self.tmp.name) / "failed-telemetry.provider.jsonl"
        writes = 0

        def failing_append(path, mode="r", *args, **kwargs):
            nonlocal writes
            if Path(path) == receipt and mode == "a":
                writes += 1
                if writes > 1:
                    raise OSError("private failure detail")
            return builtins.open(path, mode, *args, **kwargs)

        errors = io.StringIO()
        with patch.object(codex, "open", side_effect=failing_append, create=True), contextlib.redirect_stderr(errors):
            row, result = self.invoke(self.header(), receipt=receipt, require_launch=False)
        self.assertIsNone(row)
        self.assertEqual(result, (0, "ok", None))
        self.assertEqual(codex.read_state()["alpha"]["lastKind"], "ok")
        self.assertEqual([json.loads(line)["event"] for line in receipt.read_text().splitlines()], ["account-leased"])
        self.assertIn("launch evidence unavailable (OSError)", errors.getvalue())
        self.assertNotIn("private failure detail", errors.getvalue())

    def test_launch_identity_does_not_inflate_account_lease_metrics(self):
        # Import the existing consumer without touching its separately owned test file.
        spec = importlib.util.spec_from_file_location("lane_runner", ROOT / "scripts/lanes/lane_runner.py")
        lane = importlib.util.module_from_spec(spec)
        sys.modules["lane_runner"] = lane
        spec.loader.exec_module(lane)
        events = [{"provider": "codex", "event": event}
                  for event in ("account-leased", "cli-launch", "future-event", None)]
        rows = [{"provider": "codex", "providerEvidence": events}]
        report = lane.provider_throughput(rows, ["codex"])
        self.assertEqual(report["providers"]["codex"]["accountLeases"], 1)


if __name__ == "__main__":
    unittest.main()
