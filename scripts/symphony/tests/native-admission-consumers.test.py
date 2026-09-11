"""Execute the installed strict CLI through the actual native pickup consumer."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'scripts/symphony'
SCOPE = runpy.run_path(str(SOURCE / 'tests/existing-pr-repair.test.py'))
CONTROLLER = SCOPE['controller']
RUNTIME = runpy.run_path(str(SOURCE / 'tests/symphony-burrito-workflow.test.py'))

class NativeAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.home = Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.bin = self.home / '.local/bin'
        self.bin.mkdir(parents=True)
        self.workspace = self.home / 'JOV-5954'
        self.workspace.mkdir()
        self.git('init', '--quiet')
        self.git('remote', 'add', 'origin', 'https://github.com/JovieInc/Jovie.git')
        self.stack.enter_context(mock.patch.object(os, 'getcwd', return_value=str(self.workspace)))
        self.stack.enter_context(mock.patch.dict(os.environ, HOME=str(self.home),
            SYMPHONY_WORKSPACE=str(self.workspace), SYMPHONY_ISSUE_LEASE_FD='9',
            SYMPHONY_FALLBACK_LEASE_DIR=str(self.home / 'leases')))
        self.lease = self.home / 'leases/JOV-5954.lock'
        self.lease.parent.mkdir()
        try:
            saved = os.dup(9)
        except OSError:
            saved = None
        def close_lease():
            os.close(9)
            if saved is not None:
                os.dup2(saved, 9)
                os.close(saved)
        fd = os.open(self.lease, os.O_CREAT | os.O_RDWR, 0o600)
        os.dup2(fd, 9)
        if fd != 9: os.close(fd)
        self.addCleanup(close_lease)
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Real source under the installed executable name; only its interpreter
        # path is made hermetic for this fixture, never a production bypass.
        self.runtime = self.bin / 'symphony-official-runtime'
        self.runtime.write_text('#!' + sys.executable + '\n' +
            (SOURCE / 'symphony_official_runtime.py').read_text().split('\n', 1)[1])
        self.runtime.chmod(0o755)
        shutil.copyfile(SOURCE / 'closure_health.py', self.bin / 'closure_health.py')
        self.guard = self.bin / 'symphony-lease-guard'
        self.guard.write_text('#!/bin/sh\nexit 0\n')
        self.guard.chmod(0o755)
        self.gate = self.home / 'gem-workspace/state/gem-priority-gate/latest.json'
        self.gate.parent.mkdir(parents=True)
        self.payload = RUNTIME['_fleet_gate_payload']()
        self.payload.update(workAdmission=dict(allowed=True, newIssueLeaseAllowed=True, newImplementationAllowed=True),
            concurrency={'gem': dict(maxConcurrent=1, evidenceAccepted=True, newMutationAllowed=True)},
            remediationAdmission=dict(allowed=True, localAllowed=True, authority='single-pr-writer-exact-head',
                                      activities=['isolated-pr-repair'], pushAllowed=False, maxConcurrent=1))
        self.gate.write_text(json.dumps(self.payload))
        self.issue = dict(id='11111111-1111-1111-1111-111111111111', identifier='JOV-5954',
                          team={'key':'JOV'}, state={'name':'Todo'}, labels={'nodes': []},
                          updatedAt='2026-09-09T00:00:00Z')

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.workspace), *args], capture_output=True, check=True)

    def check(self, issue=None, repair=None, inherited=True):
        return CONTROLLER._native_dispatch_prerequisite('JOV-5954', self.issue if issue is None else issue,
                                                        repair, inherited=inherited)

    def test_actual_installed_gate_refuses_hold_and_preserves_receipt(self):
        self.assertIsNone(self.check())
        before = self.gate.read_bytes()
        self.assertIsNone(self.check(inherited=False))
        self.assertEqual(self.gate.read_bytes(), before)
        self.payload['workAdmission']['newIssueLeaseAllowed'] = False
        self.gate.write_text(json.dumps(self.payload))
        self.assertEqual(self.check(), 'dispatch_gate_closed')
        self.assertIsNone(self.check(repair={'validated':True}))
        self.payload['concurrency']['gem']['maxConcurrent'] = 0
        self.gate.write_text(json.dumps(self.payload))
        self.assertEqual(self.check(repair={'validated':True}), 'dispatch_gate_closed')

    def test_identity_repository_and_real_fd_must_match(self):
        for change in ({'id':'invalid'}, {'identifier':'LYB-5954'}, {'team':{}}, {'updatedAt':''}):
            self.assertEqual(self.check({**self.issue, **change}), 'native_identity_unverifiable')
        self.assertEqual(self.check({**self.issue, 'state':{'name':'In Review'}}), 'native_state_not_admitted')
        with mock.patch.dict(os.environ, SYMPHONY_ISSUE_LEASE_FD='8'):
            self.assertEqual(self.check(), 'native_issue_lease_missing')
        with mock.patch.dict(os.environ, SYMPHONY_WORKSPACE=str(self.home)):
            self.assertEqual(self.check(), 'native_workspace_mismatch')
        self.git('remote','set-url','origin','https://github.com/JovieInc/LogYourBody.git')
        self.assertEqual(self.check(), 'native_repository_mismatch')

    def test_fresh_mechanical_exclusion_and_malformed_labels_refuse(self):
        for labels in (None, [], {}, {'nodes': None}, {'nodes': {}},
                       {'nodes': [None]}, {'nodes': [{}]}, {'nodes': [{'name': 1}]},
                       {'nodes': [{'name': ''}]}):
            with self.subTest(labels=labels):
                self.assertEqual(self.check({**self.issue, 'labels': labels}), 'native_labels_unverifiable')
        issue = {k:v for k,v in self.issue.items() if k != 'labels'}
        self.assertEqual(self.check(issue), 'native_labels_unverifiable')
        self.assertEqual(self.check({**self.issue, 'labels': {'nodes': [{'name': ' No-Symphony '}]}}),
                         'native_issue_excluded')
        self.assertIsNone(self.check({**self.issue, 'labels': {'nodes': [
            {'name': 'human-review-required'}, {'name': 'needs-human'}, {'name': 'no-auto'}]}}))

    def test_new_work_rejects_different_issue_workspace_in_same_repository(self):
        wrong = self.home / 'JOV-5996'
        self.workspace.rename(wrong)
        with mock.patch.object(os, 'getcwd', return_value=str(wrong)), \
                mock.patch.dict(os.environ, SYMPHONY_WORKSPACE=str(wrong)):
            self.assertEqual(self.check(), 'native_workspace_issue_mismatch')
            # Assigned repair has already verified its exact custom workspace.
            self.assertIsNone(self.check(repair={'validated': True}))

    def test_label_arriving_after_preflight_denies_actual_router_before_provider(self):
        self.assertIsNone(self.check(inherited=False))
        self.issue['labels']['nodes'].append({'name': 'no-symphony'})
        issue_path = self.home / 'issue.json'
        issue_path.write_text(json.dumps(self.issue))
        controller = self.bin / 'symphony-codex-exhausted.py'
        controller.write_text('import json,runpy,sys\nfrom pathlib import Path\n'
            'scope=runpy.run_path(' + repr(str(SOURCE / 'symphony-codex-exhausted.py')) + ')\n'
            'reason=scope["_native_dispatch_prerequisite"](sys.argv[2], '
            'json.loads(Path(' + repr(str(issue_path)) + ').read_text()), None)\n'
            'print(reason, file=sys.stderr)\nraise SystemExit(78 if reason else 0)\n')
        calls = self.home / 'provider-called'
        provider = self.bin / 'provider-spy'
        provider.write_text('#!/bin/sh\ntouch ' + str(calls) + '\nexit 99\n')
        provider.chmod(0o755)
        env = {**os.environ, 'SYMPHONY_HOME': str(self.home), 'SYMPHONY_ROUTER_HEARTBEAT_SECONDS': '0',
               'SYMPHONY_ISSUE_LEASE_FD': '', 'SYMPHONY_ISSUE_IDENTIFIER': 'JOV-5954',
               'SYMPHONY_CAPACITY_GUARD': str(provider), 'SYMPHONY_CODEX_ACCOUNT_PROBE': str(provider),
               'SYMPHONY_AUTO_ROUTE': str(provider)}
        fcntl.flock(9, fcntl.LOCK_UN)
        result = subprocess.run(['bash', str(SOURCE / 'symphony-agent-router'), 'app-server'],
                                cwd=self.workspace, env=env, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 78, result.stderr)
        self.assertIn('native_issue_excluded', result.stderr)
        self.assertFalse(calls.exists())

    def test_label_arriving_at_final_refresh_prevents_assignment_claim(self):
        excluded = {**self.issue, 'labels': {'nodes': [{'name': 'no-symphony'}]}}
        with contextlib.ExitStack() as stack:
            for name, value in [('_autonomous_open_pr_index', {}),
                                ('_open_pr_verdict', ('remount', {'operatorRepairOnly': True})),
                                ('_validated_existing_pr_repair', {'validated': True}),
                                ('gc_fallback_locks', None), ('_emit_pickup', None)]:
                stack.enter_context(mock.patch.object(CONTROLLER, name, return_value=value))
            fetch = stack.enter_context(mock.patch.object(CONTROLLER, '_fetch_single_issue', return_value=self.issue))
            module = stack.enter_context(mock.patch.object(CONTROLLER, '_repair_module')).return_value
            self.assertEqual(CONTROLLER.pickup_check_command('JOV-5954', preflight=True), 0)
            fetch.side_effect = [self.issue, excluded]
            self.assertEqual(CONTROLLER.pickup_check_command('JOV-5954'), 78)
            module.claim.assert_not_called()

    def test_real_guard_subprocess_inherits_fd_and_wrong_or_unheld_fd_refuses(self):
        controller = self.bin / 'symphony-codex-exhausted.py'
        controller.write_text('#!' + sys.executable + '\nimport os,fcntl\n'
            'assert os.fstat(9).st_ino == os.stat(' + repr(str(self.lease)) + ').st_ino\n'
            'fcntl.flock(9,fcntl.LOCK_EX|fcntl.LOCK_NB)\n'
            'print("REPAIR_PREFLIGHT_ADMITTED identifier=JOV-5954")\n')
        controller.chmod(0o755)
        self.assertTrue(SCOPE['guard']._existing_repair_preflight('JOV-5954',
            {'state':'in review', 'updatedAt':'2026-09-09T00:00:00Z'}))
        saved = os.dup(9)
        try:
            with (self.home / 'wrong.lock').open('w') as other:
                os.dup2(other.fileno(), 9)
                self.assertEqual(self.check(), 'native_issue_lease_missing')
            os.dup2(saved, 9)
            fcntl.flock(9, fcntl.LOCK_UN)
            self.assertEqual(self.check(), 'native_issue_lease_missing')
        finally:
            os.dup2(saved, 9)
            os.close(saved)
            fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_native_hook_is_mandatory_and_actual_cli_refuses_unbound_identity(self):
        import textwrap
        workflow = (SOURCE / 'WORKFLOW.md').read_text()
        script = textwrap.dedent(workflow.split('  before_run: |\n', 1)[1].split('  before_remove:', 1)[0])
        controller = self.bin / 'symphony-codex-exhausted.py'
        for installed in (False, True):
            if installed:
                controller.write_text('import sys\nassert sys.argv[1:] == '
                    '["native-preflight", "JOV-5954", "--before-run"]\nraise SystemExit(75)\n')
            result = subprocess.run(['sh', '-c', script], cwd=self.workspace,
                                    capture_output=True, text=True, timeout=5)
            self.assertNotEqual(result.returncode, 0)
            if installed: self.assertEqual(result.returncode, 75, result.stderr)
        result = subprocess.run([sys.executable, str(SOURCE / 'symphony-codex-exhausted.py'),
            'native-preflight', 'invalid/identity', '--before-run'], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 78, result.stderr)

    def test_missing_malformed_wrong_mode_and_fenced_helpers_deny(self):
        original = self.runtime.read_bytes()
        self.runtime.unlink()
        self.assertEqual(self.check(), 'dispatch_admission_unavailable')
        for output in ('not-json', '[]', json.dumps(dict(allowed=True, mode='existing-pr-repair'))):
            self.runtime.write_text('#!' + sys.executable + '\nprint(' + repr(output) + ')\n')
            self.runtime.chmod(0o755)
            self.assertIsNotNone(self.check())
        self.runtime.write_bytes(original)
        self.guard.write_text('#!/bin/sh\nexit 1\n')
        self.assertEqual(self.check(), 'native_lease_refused')

if __name__ == '__main__': unittest.main()
