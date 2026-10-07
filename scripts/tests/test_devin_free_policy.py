"""Model-free tests for free metadata, conservative expiry and owned cleanup."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/lanes'))
import devin_free_policy as free

ACCOUNT = 'Logged in (via Devin).\n Email: t@timwhite.co\n Team ID: devin-team$account-ac57d50ecbeb4e148bdb230ffa8afc1b\n Team membership: Approved\n'


def inventory(tier='Free', family='swe-2', model='swe-2-medium'):
    return {'families': [{'family_uid': family, 'variants': [{'model_uid': model, 'cost_tier': tier}]}]}


class FreePolicyTest(unittest.TestCase):
    def setUp(self):
        self.clock = patch.object(free.time, 'time', return_value=1791410000)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def test_current_authenticated_bare_free_model_accepted(self):
        with patch.object(free, 'supported_read', side_effect=[ACCOUNT, json.dumps(inventory())]) as read:
            free.verify('swe-2-medium')
        self.assertEqual(read.call_args.args[0], ['devin', 'models', 'list', '--format', 'json'])

    def test_paid_unknown_fusion_duplicate_and_missing_proof_fail_closed(self):
        duplicate = inventory(); duplicate['families'] *= 2
        for data in (inventory('High cost'), inventory(None), inventory(family='fusion'), duplicate, {}, {'families': []}, None, [], 'unknown'):
            with self.subTest(data=data), patch.object(free, 'supported_read', side_effect=[ACCOUNT, json.dumps(data)]):
                with self.assertRaises(free.FreeProofHeld):
                    free.verify('swe-2-medium')

    def test_wrong_email_team_or_membership_rejected(self):
        for status in (ACCOUNT.replace('t@timwhite.co', 'other@example.com'), ACCOUNT.replace('Approved', 'Pending'), ACCOUNT.replace('account-ac57', 'account-other')):
            with patch.object(free, 'supported_read', return_value=status), self.assertRaises(free.FreeProofHeld):
                free.verify('swe-2-medium')

    def test_no_fusion_alias_or_implicit_model(self):
        for cmd in (['devin','-p'], ['devin','-p','--model','fusion-swe-2-medium'], ['devin','-p','--model','swe-2-medium','--model','swe-2-high']):
            with self.assertRaises(free.FreeProofHeld):
                free.command_guard(cmd, 5400)
        self.assertIsNone(free.command_guard(['codex','exec'], 5400))

    def test_metadata_read_error_never_allows_launch(self):
        with patch.object(free, 'supported_read', side_effect=OSError('offline')):
            with self.assertRaises(free.FreeProofHeld):
                free.verify('swe-2-medium')

    def test_policy_missing_invalid_or_unzoned_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(free, 'HERE', Path(tmp)):
            self.assertFalse(free.admission_open(5400))
            p = Path(tmp)/'providers.json'
            p.write_text('{bad')
            self.assertFalse(free.admission_open(5400))
            p.write_text(json.dumps({'devin': {'freeOnly': {'stopBefore':'2026-10-14T07:00:00','email':'t@timwhite.co','teamId':'team'}}}))
            self.assertFalse(free.admission_open(5400))

    def test_health_true_and_held_use_the_same_free_proof(self):
        with patch.object(free, 'verify') as verify:
            self.assertEqual(free.health(), 0)
            verify.assert_called_once_with('swe-2-medium')
        with patch.object(free, 'admission_open', return_value=False):
            self.assertEqual(free.health(), 1)

    def test_read_failure_and_expiring_deadline_never_fetch(self):
        with patch.object(free.subprocess, 'run') as run:
            run.return_value.returncode = 1
            with self.assertRaises(free.FreeProofHeld):
                free.supported_read(['devin', 'auth', 'status'])
        with patch.object(free.time, 'time', return_value=free.policy()['deadline']-60), patch.object(free.subprocess, 'run') as run:
            with self.assertRaises(free.FreeProofHeld):
                free.supported_read(['devin', 'auth', 'status'])
            run.assert_not_called()

    def test_first_run_crossing_cutoff_and_wrong_verify_model_rejected(self):
        with self.assertRaises(free.FreeProofHeld):
            free.verify('fusion-swe-2-medium')
        guard = free.command_guard(['devin','-p','--model','swe-2-medium'], 5400)
        with patch.object(free.time, 'time', return_value=free.policy()['deadline']-5400-60), patch.object(free, 'verify') as read:
            with self.assertRaises(free.FreeProofHeld):
                guard()
            read.assert_not_called()

    def test_policy_expiry_and_duration_margin_close_admission(self):
        end = free.policy()['deadline']
        self.assertFalse(free.admission_open(5400, end-5400-60))
        self.assertTrue(free.admission_open(5400, end-5400-61))
        with patch.object(free.time, 'time', return_value=end), self.assertRaises(free.FreeProofHeld):
            free.verify('swe-2-medium')

    def test_expired_host_slots_stay_zero_with_autoscaling_apply(self):
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp, patch.object(free.time, 'time', return_value=free.policy()['deadline']+1), patch.dict(os.environ, {'LANES_SLOTS_DEVIN':'4', 'SYMPHONY_AUTOSCALE':'apply'}):
            host = lane.Host(state=Path(tmp))
            self.assertEqual(host.base_slots('devin', 4), 0)
            self.assertEqual(host.slots('devin', 4), 0)

    def test_active_guard_rechecks_and_free_loss_is_actionable(self):
        guard = free.command_guard(['devin','-p','--model','swe-2-medium'], 5400)
        with patch.object(free, 'verify', side_effect=[None, free.FreeProofHeld('paid')]) as verify:
            guard(); guard()
            self.assertEqual(verify.call_count, 1)
            with patch.object(free.time, 'time', return_value=1791410031), self.assertRaises(free.FreeProofHeld):
                guard()

    def test_active_deadline_requires_no_network_read(self):
        guard = free.command_guard(['devin','-p','--model','swe-2-medium'], 5400)
        with patch.object(free, 'verify'):
            guard()
        with patch.object(free.time, 'time', return_value=free.policy()['deadline']-60), patch.object(free, 'verify') as read:
            with self.assertRaises(free.FreeProofHeld):
                guard()
            read.assert_not_called()

    def test_supported_reads_have_deadline_bounded_timeouts(self):
        with patch.object(free.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '{}'
            free.supported_read(['devin','models','list','--format','json'])
            self.assertEqual(run.call_args.kwargs['timeout'], 10)

    def test_native_gate_helper_returns_policy_hold_after_real_cleanup(self):
        import fcntl
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cli = root/'devin'
            cli.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n')
            cli.chmod(0o700)
            calls = []
            def active_guard():
                calls.append('free')
                if len(calls) > 1:
                    raise free.FreeProofHeld('free-proof-lost')
            with patch.object(free, 'command_guard', return_value=active_guard), patch.object(lane, 'Host', return_value=lane.Host(state=root)):
                self.assertEqual(lane.main(['gate-command', '--timeout', '10', '--', str(cli), '-p', '--model', 'swe-2-medium']), 75)
            # The real helper's inherited controller lock is released only after
            # run_agent proves its process cleanup; it must not become a new hold.
            with open(root/'lifecycle.lock', 'r+') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_owned_process_cleanup_and_existing_guard_preserved(self):
        os.environ['LANES_EXECUTION_BACKEND'] = 'local-test'
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp:
            cli = Path(tmp)/'devin'
            cli.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n')
            cli.chmod(0o700)
            calls = []
            def active_guard():
                calls.append('free')
                if calls.count('free') > 1:
                    raise free.FreeProofHeld('free-proof-lost')
            with tempfile.TemporaryFile(mode='w+') as log, patch.object(free, 'command_guard', return_value=active_guard), patch.object(lane.lifecycle, 'active', return_value=False):
                with self.assertRaises(free.FreeProofHeld):
                    lane.run_agent([str(cli),'-p','--model','swe-2-medium'], Path(tmp), log, 10,
                                   guard=lambda: calls.append('ownership'), guard_interval=.01,
                                   on_kill=lambda error: calls.append('revoked'))
            self.assertEqual(calls[:2], ['ownership', 'free'])
            self.assertIn('revoked', calls)


if __name__ == '__main__':
    unittest.main()
