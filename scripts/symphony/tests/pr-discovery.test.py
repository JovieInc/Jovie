#!/usr/bin/env python3
"""Hermetic complete/unknown discovery and duplicate-writer admission tests."""
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'scripts/symphony/symphony-codex-exhausted.py'
spec = importlib.util.spec_from_file_location('discovery_controller', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def pr(number, head=None):
    return {'number': number, 'headRefName': head or f'symphony/JOV-{number}-fix',
            'mergeStateStatus': 'DIRTY', 'mergeable': 'CONFLICTING'}


def page(nodes, more=False, cursor=None):
    return {'data': {'repository': {'pullRequests': {
        'nodes': nodes, 'pageInfo': {'hasNextPage': more, 'endCursor': cursor}}}}}


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {'SYMPHONY_OPEN_PR_INDEX': ''})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_complete_empty_is_the_only_absence_authority(self):
        with mock.patch.object(module, '_gh_json', return_value=page([])):
            index = module._autonomous_open_pr_index(['JOV-1'])
        self.assertEqual(module._open_pr_verdict('JOV-1', index), ('none', None))
        self.assertFalse(index.unknown_repos)

    def test_more_than_one_hundred_prs_uses_cursor_and_keeps_last(self):
        with mock.patch.object(module, '_gh_json', side_effect=[
            page([pr(n) for n in range(1, 101)], True, 'next'), page([pr(101)])
        ]) as request:
            index = module._autonomous_open_pr_index(['JOV-101'])
        self.assertEqual(index['JOV-101']['number'], 101)
        self.assertIn('cursor=next', request.call_args_list[1].args[0])
        self.assertLessEqual(request.call_args_list[1].kwargs['timeout'], module.GH_TIMEOUT_SECONDS)
        self.assertEqual(module._open_pr_verdict('JOV-101', index)[0], 'remount')

    def test_unknown_and_partial_responses_never_authorize_absence(self):
        for response in [None, [], {}, {'errors': [{'message': 'quota'}]},
                         {'data': {'repository': None}}, page('bad'), page([], 'yes'),
                         page([{}]), page([pr(True)]), page([pr(0)]),
                         page([dict(pr(1), headRefName=None)]), page([pr(1), pr(1)]),
                         page([], True), page([], True, '')]:
            with self.subTest(response=response), mock.patch.object(module, '_gh_json', return_value=response):
                index = module._autonomous_open_pr_index(['JOV-1'])
                self.assertEqual(module._open_pr_verdict('JOV-1', index), ('unknown', None))
        with mock.patch.object(module, '_gh_json', side_effect=[page([pr(1)], True, 'next'), None]):
            index = module._autonomous_open_pr_index(['JOV-1'])
        self.assertNotIn('JOV-1', index)
        self.assertEqual(module._open_pr_verdict('JOV-1', index)[0], 'unknown')

    def test_deadline_cursor_cycle_and_page_limit_are_unknown(self):
        with mock.patch.object(module.time, 'monotonic', side_effect=[0, module.GH_TIMEOUT_SECONDS]), mock.patch.object(module, '_gh_json') as request:
            self.assertIsNone(module._complete_open_prs(module.JOV_REPO))
            request.assert_not_called()
        with mock.patch.object(module, '_gh_json', return_value=page([], True, 'same')):
            self.assertIsNone(module._complete_open_prs(module.JOV_REPO))
        with mock.patch.object(module, '_gh_json', side_effect=[page([], True, str(n)) for n in range(100)]) as request:
            self.assertIsNone(module._complete_open_prs(module.JOV_REPO))
            self.assertEqual(request.call_count, 100)

    def test_unrelated_repository_failure_does_not_fence_healthy_lane(self):
        with mock.patch.object(module, '_complete_open_prs', side_effect=lambda repo: None if repo == module.JOV_REPO else [pr(2, 'symphony/LYB-2-fix')]):
            index = module._autonomous_open_pr_index()
        self.assertEqual(module._open_pr_verdict('JOV-1', index)[0], 'unknown')
        self.assertEqual(module._open_pr_verdict('LYB-2', index)[0], 'remount')
        self.assertEqual(module._open_pr_verdict('LYB-3', index)[0], 'none')

    def test_sibling_prs_are_preserved_and_require_owner_disposition(self):
        with mock.patch.object(module, '_complete_open_prs', return_value=[pr(1, 'symphony/JOV-9-fix'), pr(2, 'fallback/JOV-9-fix')]):
            index = module._autonomous_open_pr_index(['JOV-9'])
        self.assertEqual([p['number'] for p in index['JOV-9']['siblings']], [1, 2])
        self.assertEqual(module._open_pr_verdict('JOV-9', index)[0], 'unknown')
        with mock.patch.object(module, '_autonomous_open_pr_index', return_value=index), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(module.open_pr_verdict_command('JOV-9'), 75)
        self.assertEqual([p['number'] for p in json.loads(output.getvalue())['siblings']], [1, 2])

    def test_filters_non_autonomous_and_unwanted_heads(self):
        with mock.patch.object(module, '_complete_open_prs', return_value=[pr(1, 'feature/unrelated'), pr(2), pr(3)]):
            self.assertEqual(set(module._autonomous_open_pr_index(['JOV-3'])), {'JOV-3'})
        with mock.patch.object(module, '_complete_open_prs') as request:
            self.assertEqual(module._autonomous_open_pr_index(['OTHER-1']), {})
            request.assert_not_called()
        with mock.patch.dict(os.environ, {'SYMPHONY_OPEN_PR_INDEX': 'empty'}), mock.patch.object(module, '_complete_open_prs') as request:
            self.assertEqual(module._autonomous_open_pr_index(), {})
            request.assert_not_called()

    def test_cli_and_pickup_return_typed_unknown(self):
        with mock.patch.object(module, '_complete_open_prs', return_value=None), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(module.open_pr_verdict_command('JOV-1'), 75)
        self.assertEqual(json.loads(output.getvalue())['verdict'], 'unknown')
        self.assertEqual(module.pickup_refuse_reason('JOV-1', issue=None, pr_verdict='unknown', held=False), 'open_pr_inventory_unknown')

    def test_grok_cli_failure_stops_before_workspace_or_model_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / '.local/bin'
            bin_dir.mkdir(parents=True)
            binary = bin_dir / 'symphony-codex-exhausted'
            binary.write_text('#!/bin/sh\necho \'{"verdict":"unknown"}\'\nexit 75\n')
            binary.chmod(0o755)
            flock = bin_dir / 'flock'
            flock.write_text('#!/bin/sh\nexit 0\n')
            flock.chmod(0o755)
            selection = base64.b64encode(json.dumps({'schema_version': 1, 'deterministic_first': True, 'selected': {'provider': 'fixture', 'id': 'fixture', 'model': 'fixture', 'executor': {'executable': '/not-launched', 'argv': []}}}).encode()).decode()
            result = subprocess.run(['bash', str(ROOT / 'scripts/symphony/grok-ship-one'), 'JOV-99999'],
                env={**os.environ, 'HOME': str(root), 'LINEAR_API_KEY': 'fixture', 'GROK_SHIP_WS_ROOT': str(root/'workspaces'), 'SYMPHONY_FALLBACK_SELECTION_B64': selection, 'SYMPHONY_FALLBACK_ISSUE_REVISION': 'fixture', 'SYMPHONY_FALLBACK_BUNDLE_REVISION': 'fixture', 'SYMPHONY_FALLBACK_UNIT': 'fixture'},
                text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertIn('open_pr_inventory_unknown', (root/'grok-ship-logs/JOV-99999.log').read_text())
            self.assertFalse((root/'workspaces/JOV/JOV-99999').exists())

    def test_unknown_pickup_waits_before_tracker_or_gc(self):
        with (mock.patch.object(module, '_complete_open_prs', return_value=None),
              mock.patch.object(module, '_fetch_single_issue') as tracker,
              mock.patch.object(module, 'gc_fallback_locks') as gc,
              contextlib.redirect_stderr(io.StringIO()) as output):
            self.assertEqual(module.pickup_check_command('JOV-1'), 75)
        tracker.assert_not_called()
        gc.assert_not_called()
        self.assertIn('class=pr-inventory-unknown retryable=true', output.getvalue())


if __name__ == '__main__':
    unittest.main()
