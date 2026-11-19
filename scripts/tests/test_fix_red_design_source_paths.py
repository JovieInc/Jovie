"""Regression for design-source paths in prefixed CI logs."""
import unittest
from unittest.mock import patch

from scripts.tests.test_fix_red_failure_routing import classes, lane, red


class DesignSourcePathsTest(unittest.TestCase):
    def test_prefixed_pr_25217_diagnostic_retains_paths_for_the_main_sync_probe(self):
        paths = [
            'apps/web/components/features/dashboard/molecules/EmailSignatureDialog.tsx',
            'apps/web/components/features/dashboard/molecules/MatchConfidenceBreakdown.tsx',
        ]
        prefix = 'Source Validation\tRun deterministic source contract\t'
        header = ('2026-11-17T04:41:20.1897689Z ##[error]AssertionError: '
                  '[design-system-source-ratchet] FAIL — 1888 identities (0 new / baseline 1907)')
        identities = [
            f'new design identity: {paths[0]}\traw-hex-color\t#0d0e12',
            f'new design identity: {paths[1]}\traw-palette-class\tbg-amber-500',
            f'new design identity: {paths[1]}\traw-palette-class\tbg-green-500',
        ]
        diagnostic = '\n'.join(prefix + line for line in [header, *identities, *identities])
        pr = {**red('Source Validation'), 'queueFailure': None, 'eventKinds': []}
        for log in (diagnostic, 'passing fixture: API rate limit exceeded\n' + diagnostic):
            with self.subTest(log=log), patch.object(lane, 'failed_logs', return_value={'Source Validation': log}):
                self.assertIsNone(lane.infra_only_red(None, pr))
                route = lane.route_fix_red(None, pr)
                self.assertEqual((route['cls'], route['action']), ('design-source-cli', 'sync-main'))
                self.assertEqual(route['files'], paths)
        for log in (diagnostic.replace('FAIL', 'PASS'), '\n'.join(identities)):
            route = classes.classify(pr, {'Source Validation': log})
            self.assertEqual(route['files'], [])

