"""Real merge-group deadline evidence must reach its owner before any feature repair."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import fix_red_classes as classes
import lane_runner as lane

HEAD = '99320365a5ba5f03eb7cfd48c1a10137bd3d4031'
RUN = 42922034233
ANNOTATION = ('Error: public-profile alias graduation review was due 2026-11-07T06:00:00Z '
              '(JOV-8737) and its 72h grace ended 2026-11-10T06:00:00.000Z; re-review and refresh it.')
LOG = ('2026-11-10T23:22:48.2731431Z ##[error]Structural command 41/60 failed (exit 1). '
       'Command: pnpm exec vitest --root scripts --config vitest.config.mts run | ' + ANNOTATION + '\n'
       '2026-11-10T23:22:48.2736424Z Tests  1 failed | 335 passed | 1 skipped (337)\n'
       '2026-11-10T23:22:48.2742323Z ' + ANNOTATION + '\n')


def feature():
    return {'number': 23211, 'headRefOid': HEAD, 'headRefName': 'fix/apple-music-visitor-storefront',
            'url': 'https://github.com/JovieInc/Jovie/pull/23211', 'mergeStateStatus': 'CLEAN',
            'statusCheckRollup': [], 'eventKinds': ['dequeued'], 'queueFailure': LOG}


def red(*names):
    return {**feature(), 'mergeStateStatus': 'BLOCKED',
            'statusCheckRollup': [{'name': n, 'conclusion': 'FAILURE'} for n in names]}


class LocalModulePrerequisiteTest(unittest.TestCase):
    def test_missing_local_prerequisite_syncs_main_before_fixture_infra(self):
        diagnostic = ("lib/waitlist/winback-approval.server.ts(23,8): error TS2307: "
                      "Cannot find module '@/lib/waitlist/winback' or its corresponding type declarations.")
        for state in ("BLOCKED", "BEHIND"):
            for log in (diagnostic, "passing fixture: API rate limit exceeded\n##[error]" + diagnostic):
                got = classes.classify({**red("Source Validation"), "mergeStateStatus": state}, {"Source Validation": log})
                self.assertEqual((got["cls"], got["action"]), ("local-module-prerequisite", "sync-main"))

    def test_missing_package_or_fixture_text_does_not_request_prerequisite_sync(self):
        for log in (
            "lib/a.ts(1,1): error TS2307: Cannot find module 'external-package' or its corresponding type declarations.",
            "passing test: Cannot find module '@/lib/waitlist/winback'",
            "lib/a.ts(1,1): error TS2305: Module '@/lib/a' has no exported member 'missing'.",
        ):
            got = classes.classify(red("Source Validation"), {"Source Validation": log})
            self.assertEqual((got["cls"], got["action"]), ("other", "agent"))


class RouteBudgetGrowthTest(unittest.TestCase):
    def test_annotated_budget_growth_syncs_main_before_fixture_infra(self):
        growth = ('2026-11-13T03:11:53.2279082Z ##[error]routes./app/chat/[id] grew 823 -> 1385\n'
                  '##[error]firstLoad.baselines./start grew 804 -> 1247\n'
                  '##[error]groups.dashboard.baselineKb grew 1199 -> 1385\n')
        for log in (growth, '\x1b[31m' + growth + '\x1b[0m',
                    'passing fixture: API rate limit exceeded; HTTP 503\n' + growth):
            route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': log})
            self.assertEqual((route['cls'], route['action']), ('route-budget-growth', 'sync-main'))

    def test_runtime_budget_failures_and_passing_fixtures_stay_with_agent(self):
        growth = '##[error]routes./app/chat grew 822 -> 1385\n'
        for log in ('routes./app/chat grew 822 -> 1385\n',
                    'echo "' + growth.strip() + '"\n',
                    '##[error]routes./app/chat grew 1385 -> 822\n',
                    '##[error]routes./app/chat grew 822 -> 822\n',
                    growth + '##[error]/app grew beyond its measured JS budget\n',
                    growth + 'FAIL home.test.tsx > shows setup\nAssertionError: hidden setup\n',
                    growth + 'Error: the build failed\n',
                    'FAIL /app/chat: 1400 / 822 KB gz\n'):
            route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': log})
            self.assertEqual(route['action'], 'agent', log)


class AliasClassificationTest(unittest.TestCase):
    def test_real_annotation_and_complete_failure_have_owned_no_model_route(self):
        for log in (ANNOTATION, LOG, '\x1b[31m' + LOG + '\x1b[0m',
                    'passing fixture: API rate limit exceeded; HTTP 503\n' + LOG):
            with self.subTest(log=log[:50]):
                route = classes.classify(red('ci-fast (remaining)'), {'ci-fast (remaining)': log})
                self.assertEqual((route['cls'], route['action']),
                                 ('alias-review-deadline', 'alias-graduation-owner'))
                self.assertEqual(route['evidenceOwner']['issue'], 'JOV-8737')
                self.assertEqual(route['evidenceOwner']['collector'],
                                 'scripts/lib/public-profile-alias-graduation.mjs')
                self.assertIn(route['action'], classes.DETERMINISTIC)

    def test_owner_is_read_from_failure_not_assumed_from_today(self):
        log = ANNOTATION.replace('JOV-8737', 'JOV-8338')
        route = classes.classify(red('structural'), {'structural': log})
        self.assertEqual(route.get('evidenceOwner', {}).get('issue'), 'JOV-8338')

    def test_passing_fixture_unknown_and_multiple_failures_do_not_defer(self):
        cases = [
            'PASS deadline fixture prints ' + ANNOTATION + '\nAssertionError: actual product bug',
            LOG.replace('1 failed', '2 failed'),
            LOG + 'FAIL app/profile.test.ts > keeps the right artist\nAssertionError: wrong artist',
            LOG + '##[error]TypeScript compilation failed\nerror TS2322: bad product type',
            LOG + 'AssertionError: a different failure in the same test file',
            LOG.replace('JOV-8737', 'JOV-8338') + LOG,
            ANNOTATION.replace('public-profile alias graduation', 'another policy'),
            ANNOTATION.replace('(JOV-8737)', '(unknown)'),
        ]
        for log in cases:
            with self.subTest(log=log[-70:]):
                route = classes.classify(red('structural'), {'structural': log})
                self.assertNotEqual(route['action'], 'alias-graduation-owner')

    def test_mixed_checks_keep_the_real_product_repair(self):
        route = classes.classify(red('structural', 'product'),
                                 {'structural': LOG, 'product': 'AssertionError: wrong artist'})
        self.assertEqual((route['cls'], route['action']), ('mixed', 'agent'))


class QueueEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.host = types.SimpleNamespace(state=Path(self.tmp.name), repo=Path(self.tmp.name))
        self.status = {'sha': HEAD, 'total_count': 1, 'statuses': [
            {'context': 'jovie-queue-failure-hold/v1', 'state': 'success',
             'description': f'class=deterministic-source;n=1;run={RUN};try=1',
             'target_url': f'https://github.com/JovieInc/Jovie/actions/runs/{RUN}'}]}
        self.run = {'id': RUN, 'event': 'merge_group', 'status': 'completed', 'conclusion': 'failure',
                    'run_attempt': 1, 'head_sha': 'd1b5c6ef18dce9fe4ce9c09d9cf558b56524aa39',
                    'head_branch': 'gh-readonly-queue/main/pr-23211-aac92c18d2adf238a5c673bdac8aac8ffed11e89'}
        self.jobs = {'total_count': 4, 'jobs': [
            {'id': n, 'run_id': RUN, 'status': 'completed', 'conclusion': 'failure', 'name': name}
            for n, name in enumerate(('ci-fast (remaining)', 'ci-fast', 'PR Ready', 'Product Lane Receipt'), 10)]}
        self.log = LOG

    def query(self, argv, **kwargs):
        if argv == ['api', f'repos/JovieInc/Jovie/commits/{HEAD}/status?per_page=100']:
            value = self.status
        elif argv == ['api', f'repos/JovieInc/Jovie/actions/runs/{RUN}']:
            value = self.run
        elif argv == ['api', f'repos/JovieInc/Jovie/actions/runs/{RUN}/attempts/1/jobs?per_page=100']:
            value = self.jobs
        elif argv == ['run', 'view', '--repo', 'JovieInc/Jovie', '--job', '10', '--log-failed']:
            return subprocess.CompletedProcess(argv, 0, self.log, '')
        else:
            raise AssertionError(f'unexpected or mutating GitHub command: {argv}')
        return subprocess.CompletedProcess(argv, 0, json.dumps(value), '')

    def route(self, pr=None):
        with patch.object(lane, 'failed_logs', return_value={}), \
                patch.object(lane, 'gh_call', side_effect=self.query):
            return lane.route_fix_red(self.host, pr or feature())

    def test_source_green_queue_failure_is_bound_to_current_hold_run_and_attempt(self):
        route = self.route()
        self.assertEqual(route['action'], 'alias-graduation-owner')
        self.assertEqual(route['evidenceOwner']['sourceHead'], HEAD)
        self.assertEqual(route['evidenceOwner']['runId'], RUN)
        self.assertEqual(route['evidenceOwner']['attempt'], 1)

    def test_native_status_contexts_are_green_but_pending_or_failed_contexts_are_not(self):
        pr = {**feature(), 'statusCheckRollup': [
            {'__typename': 'CheckRun', 'name': 'Source Validation', 'status': 'COMPLETED', 'conclusion': 'SUCCESS'},
            {'__typename': 'StatusContext', 'context': 'jovie-queue-failure-hold/v1', 'state': 'SUCCESS'}]}
        self.assertEqual(self.route(pr)['action'], 'alias-graduation-owner')
        for state in ('PENDING', 'EXPECTED', 'ERROR', 'FAILURE'):
            with self.subTest(state=state):
                pr['statusCheckRollup'][1]['state'] = state
                self.assertNotEqual((self.route(pr) or {}).get('action'), 'alias-graduation-owner')

    def test_stale_unknown_and_mixed_queue_evidence_cannot_route_around_product_work(self):
        variants = [
            ('status head', lambda: self.status.update(sha='a' * 40)),
            ('hold absent', lambda: self.status.update(statuses=[])),
            ('hold incomplete', lambda: self.status.update(total_count=2)),
            ('retry supersedes hold', lambda: self.status.update(total_count=2, statuses=[
                *self.status['statuses'], {'context': 'jovie-queue-failure-retry/v1'}])),
            ('malformed statuses', lambda: self.status.update(statuses=[None])),
            ('hold run URL', lambda: self.status['statuses'][0].update(target_url='https://example.invalid')),
            ('run event', lambda: self.run.update(event='pull_request')),
            ('run attempt', lambda: self.run.update(run_attempt=2)),
            ('wrong PR', lambda: self.run.update(head_branch='gh-readonly-queue/main/pr-23212-' + 'a' * 40)),
            ('pending run', lambda: self.run.update(status='in_progress')),
            ('job pagination', lambda: self.jobs.update(total_count=5)),
            ('pending job', lambda: self.jobs['jobs'][0].update(status='in_progress')),
            ('wrong job run', lambda: self.jobs['jobs'][0].update(run_id=1)),
            ('malformed jobs', lambda: self.jobs.update(jobs=[None], total_count=1)),
            ('oversized log', lambda: setattr(self, 'log', LOG + 'x' * 250_000)),
            ('empty log', lambda: setattr(self, 'log', '')),
            ('other failure', lambda: self.jobs['jobs'].append(
                {'id': 99, 'run_id': RUN, 'status': 'completed', 'conclusion': 'failure', 'name': 'web-unit'})),
        ]
        baseline = copy.deepcopy((self.status, self.run, self.jobs))
        for name, change in variants:
            with self.subTest(name=name):
                self.status, self.run, self.jobs = copy.deepcopy(baseline)
                self.log = LOG
                change()
                self.assertNotEqual((self.route() or {}).get('action'), 'alias-graduation-owner')

    def test_a_genuine_source_failure_wins_over_legacy_queue_excerpt(self):
        pr = red('product')
        with patch.object(lane, 'failed_logs', return_value={'product': 'AssertionError: wrong artist'}), \
                patch.object(lane, 'gh_call') as read:
            route = lane.route_fix_red(self.host, pr)
        self.assertEqual(route['action'], 'agent')
        read.assert_not_called()

    def test_pending_checks_conflicts_and_review_requests_keep_existing_routes(self):
        for change in ({'statusCheckRollup': [{'name': 'web', 'conclusion': None}]},
                       {'mergeStateStatus': 'DIRTY'}, {'reviewDecision': 'CHANGES_REQUESTED'}):
            with self.subTest(change=change), patch.object(lane, 'gh_call') as read:
                with patch.object(lane, 'failed_logs', return_value={}):
                    route = lane.route_fix_red(self.host, {**feature(), **change})
                self.assertNotEqual((route or {}).get('action'), 'alias-graduation-owner')
                read.assert_not_called()

    def test_infrastructure_shortcut_cannot_spend_a_retry_on_sole_alias_failure(self):
        pr = {**red('structural'), 'queueFailure': None, 'eventKinds': []}
        with patch.object(lane, 'failed_logs', return_value={'structural': 'HTTP 503 fixture\n' + LOG}):
            self.assertIsNone(lane.infra_only_red(self.host, pr))

    def test_owner_handoff_stops_before_execution_and_does_not_refund_attempts(self):
        pr = feature()
        attempts = self.host.state / 'fix-attempts.json'
        attempts.write_text(json.dumps({'23211': {'sha': HEAD, 'count': 1}}))
        with patch.object(lane, 'require_fix_target', return_value=pr), \
                patch.object(lane, 'infra_only_red', return_value=None), \
                patch.object(lane, 'failed_logs', return_value={}), \
                patch.object(lane, 'gh_call', side_effect=self.query), \
                patch.object(lane, 'execution_coordination', side_effect=AssertionError('agent path reached')), \
                patch.object(lane, 'install_dependencies') as install, \
                patch.object(lane, 'run_agent') as agent, \
                patch.object(lane, '_rerun_failed') as rerun, \
                patch.object(lane, 'claim_route') as claim:
            receipt = lane._fix_red_pr(self.host, 'test', {}, pr)
        self.assertEqual(receipt['verdict'], 'skipped')
        self.assertEqual(receipt['reasons'], ['shared-evidence:alias-graduation:JOV-8737'])
        self.assertEqual(receipt['failureFingerprint']['evidenceOwner']['issue'], 'JOV-8737')
        self.assertEqual(json.loads(attempts.read_text())['23211']['count'], 1)
        self.assertNotIn('attemptRefunded', receipt)
        for operation in (install, agent, rerun, claim):
            operation.assert_not_called()


if __name__ == '__main__':
    unittest.main()
