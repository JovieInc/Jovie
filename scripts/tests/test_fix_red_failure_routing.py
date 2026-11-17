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


class DesignSourceCliTest(unittest.TestCase):
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

    def test_infrastructure_shortcut_preserves_design_failure_routes(self):
        summary = (' FAIL workspace-scripts lib/__tests__/design-system-source-ratchet.test.mjs'
                   ' > design-system source identity ratchet > exits zero from the CLI on the live tree\n')
        direct = ('[design-system-source-ratchet] FAIL — 1900 identities\n'
                  'new design identity: apps/web/components/shell/StatusBadge.tsx'
                  '\traw-palette-class\tbg-amber-300\n')
        for diagnostic in (summary, direct):
            for mixed in (False, True):
                pr = {**red('Source Validation'), 'queueFailure': None, 'eventKinds': []}
                logs = {'Source Validation': 'passing fixture: API rate limit exceeded\n' + diagnostic}
                if mixed:
                    pr['statusCheckRollup'].append({'name': 'Unit Tests', 'conclusion': 'FAILURE'})
                    logs['Unit Tests'] = 'passing fixture: API rate limit exceeded\nAssertionError: real product bug'
                with patch.object(lane, 'failed_logs', return_value=logs):
                    self.assertIsNone(lane.infra_only_red(None, pr))
                    self.assertEqual(lane.route_fix_red(None, pr)['action'], 'agent' if mixed else 'sync-main')
        pr = {**red('Source Validation'), 'queueFailure': None, 'eventKinds': []}
        with patch.object(lane, 'failed_logs', return_value={'Source Validation': 'API rate limit exceeded'}):
            self.assertEqual(lane.infra_only_red(None, pr), 'api-rate-limit-exceeded')

    def test_direct_identity_diagnostic_uses_existing_main_sync_route(self):
        header = '[design-system-source-ratchet] FAIL — 1900 identities (0 new / baseline 1907)\n'
        identity = ('new design identity: apps/web/components/shell/StatusBadge.tsx'
                    '\traw-palette-class\tbg-amber-300\n')
        noise = 'passing fixture: github-quota-deferred; API rate limit exceeded; HTTP 503\n'
        for log in (header + identity, noise + header + identity):
            got = classes.classify(red('Source Validation'), {'Source Validation': log})
            self.assertEqual((got['cls'], got['action']), ('design-source-cli', 'sync-main'))
            self.assertEqual(got['actions'], ['sync-main'])
        for log in (header, identity, header.replace('FAIL', 'PASS') + identity,
                    header + identity.replace('raw-palette-class', 'unknown-rule')):
            got = classes.classify(red('Source Validation'), {'Source Validation': noise + log})
            self.assertEqual((got['cls'], got['action']), ('quota-deferred', 'rerun'))


class LocalModulePrerequisiteTest(unittest.TestCase):
    def test_missing_local_prerequisite_syncs_main_before_fixture_infra(self):
        diagnostic = ("lib/waitlist/winback-approval.server.ts(23,8): error TS2307: "
                      "Cannot find module '@/lib/waitlist/winback' or its corresponding type declarations.")
        for state in ("BLOCKED", "BEHIND"):
            diagnostics = [diagnostic.replace("lib/waitlist/winback-approval.server.ts", source)
                           for source in ("lib/waitlist/winback-approval.server.ts", "hooks/useWinback.ts",
                                          "types/winback.ts", "constants/winback.ts", "infrastructure/winback.ts")]
            for log in diagnostics + ["passing fixture: API rate limit exceeded\n##[error]" + item for item in diagnostics]:
                got = classes.classify({**red("Source Validation"), "mergeStateStatus": state}, {"Source Validation": log})
                self.assertEqual((got["cls"], got["action"]), ("local-module-prerequisite", "sync-main"))

    def test_infrastructure_shortcut_preserves_the_local_prerequisite_route(self):
        pr = {**red("Source Validation"), "queueFailure": None, "eventKinds": []}
        log = ("passing fixture: API rate limit exceeded\n##[error]"
               "lib/waitlist/winback-approval.server.ts(23,8): error TS2307: "
               "Cannot find module '@/lib/waitlist/winback' or its corresponding type declarations.")
        with patch.object(lane, "failed_logs", return_value={"Source Validation": log}):
            self.assertIsNone(lane.infra_only_red(None, pr))
            self.assertEqual(lane.route_fix_red(None, pr)["action"], "sync-main")

    def test_infrastructure_shortcut_preserves_composed_prerequisite_sync(self):
        pr = {**red("Source Validation", "Design Conformance"), "queueFailure": None, "eventKinds": []}
        logs = {
            "Source Validation": ("passing fixture: API rate limit exceeded\n"
                                  "lib/waitlist/winback-approval.server.ts(23,8): error TS2307: "
                                  "Cannot find module '@/lib/waitlist/winback'"),
            "Design Conformance": "passing fixture: API rate limit exceeded\nsource changed; renew certification evidence",
        }
        with patch.object(lane, "failed_logs", return_value=logs):
            route = lane.route_fix_red(None, pr)
            self.assertEqual((route["cls"], route["action"]), ("composed", "sync-main"))
            self.assertIsNone(lane.infra_only_red(None, pr))

    def test_mixed_prerequisite_and_product_failure_stays_with_agent(self):
        pr = {**red("Source Validation", "Exact-head Coverage"), "queueFailure": None, "eventKinds": []}
        logs = {
            "Source Validation": ("passing fixture: API rate limit exceeded\n"
                                  "lib/waitlist/winback-approval.server.ts(23,8): error TS2307: "
                                  "Cannot find module '@/lib/waitlist/winback'"),
            "Exact-head Coverage": "passing fixture: API rate limit exceeded\nUnwired: scripts/a.test.mjs. Wire each file into a ci-fast lane",
        }
        with patch.object(lane, "failed_logs", return_value=logs):
            route = lane.route_fix_red(None, pr)
            self.assertEqual((route["cls"], route["action"]), ("mixed", "agent"))
            self.assertIsNone(lane.infra_only_red(None, pr))

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

    def test_log_failed_job_prefix_still_syncs_main(self):
        prefixed = (
            'Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:13.5084741Z ##[error]routes./app/admin/hud grew 738 -> 975\n'
            'Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:13.5103474Z ##[error]firstLoad.baselines./ grew 578 -> 663\n'
            'Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:13.6219908Z ##[error]Process completed with exit code 1.\n')
        route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': prefixed})
        self.assertEqual((route['cls'], route['action']), ('route-budget-growth', 'sync-main'))
        poisoned = prefixed + (
            'Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:14.0000000Z ##[error]AssertionError: expected 1 to be +0\n')
        stay = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': poisoned})
        self.assertEqual(stay['action'], 'agent')


class RenderModeSnapshotDriftTest(unittest.TestCase):
    LOSS = ('/brand baseline weakened: html 103027 -> 105679 bytes. '
            'A loss needs an unexpired overrides entry in apps/web/scripts/route-render-modes.json '
            '(owner, reason, issue, removalCondition, evidence, expiresOn).')

    def test_inherited_snapshot_loosening_syncs_main_before_fixture_infra(self):
        marked = '::error::' + self.LOSS + '\n'
        prefixed = ('Exact-head Coverage\tCheck render modes\t'
                    '2026-11-16T04:14:32.0162757Z ##[error]' + self.LOSS + '\n'
                    'Exact-head Coverage\tCheck render modes\t'
                    '2026-11-16T04:14:32.0162758Z ##[error]Process completed with exit code 1.\n')
        notice = ('::notice::67 route(s) are cheaper than recorded '
                  '(e.g. /: static html=287251 -> static html=274803). Lock the win in.\n')
        mode = '::error::/auth-return baseline weakened: render mode static -> dynamic. A loss needs an override.\n'
        window = '::error::/about baseline weakened: revalidate window 3600 s -> 60 s. A loss needs an override.\n'
        for log in (marked, '##[error]' + self.LOSS + '\n',
                    '2026-11-16T04:14:32.0162757Z ::error::' + self.LOSS + '\n',
                    '\x1b[31m' + marked + '\x1b[0m',
                    'passing fixture: API rate limit exceeded; HTTP 503\n' + notice + marked,
                    prefixed, marked + mode + window):
            route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': log})
            self.assertEqual((route['cls'], route['action']), ('render-mode-snapshot', 'sync-main'), log)

    def test_real_render_regressions_and_unmarked_lines_stay_with_agent(self):
        marked = '::error::' + self.LOSS + '\n'
        for log in (self.LOSS + '\n',
                    'echo "' + marked.strip() + '"\n',
                    '::error::/brand baseline weakened: html 105679 -> 103027 bytes. A loss needs an override.\n',
                    '::error::/brand baseline weakened: html 103027 -> 103027 bytes. A loss needs an override.\n',
                    marked + '::error::/brand prerendered HTML grew 1 -> 2 bytes (allowed 9).\n',
                    marked + '::error::/brand lost cacheability: static -> dynamic.\n',
                    marked + 'FAIL home.test.tsx > shows setup\nAssertionError: hidden setup\n',
                    marked + 'Error: the build failed\n'):
            route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': log})
            self.assertEqual(route['action'], 'agent', log)

    def test_design_source_and_snapshot_drift_compose_one_main_sync(self):
        source = (' FAIL workspace-scripts lib/__tests__/design-system-source-ratchet.test.mjs'
                  ' > design-system source identity ratchet > exits zero from the CLI on the live tree\n')
        coverage = '::error::' + self.LOSS + '\n::notice::1 route(s) are cheaper than recorded.\n'
        route = classes.classify(
            red('Source Validation', 'Exact-head Coverage'),
            {'Source Validation': source, 'Exact-head Coverage': coverage})
        self.assertEqual((route['cls'], route['action']), ('composed', 'sync-main'))
        self.assertEqual(route['actions'], ['sync-main'])

    def test_budget_growth_log_still_syncs_main(self):
        growth = '##[error]routes./app/chat/[id] grew 823 -> 1385\n'
        route = classes.classify(red('Exact-head Coverage'), {'Exact-head Coverage': growth})
        self.assertEqual((route['cls'], route['action']), ('route-budget-growth', 'sync-main'))


class TreeByteBudgetTest(unittest.TestCase):
    def test_stale_head_route_precedes_the_general_tree_budget_route(self):
        stale = ('##[error]PR head has 207672844 tracked regular-file bytes, exceeding the '
                 '207618048-byte repository budget, while the merged tree fits at 207583562 bytes\n')
        hygiene = ('198.05 MiB of tracked regular files exceeds the 198.00 MiB repository budget\n')
        for log in (stale, hygiene + stale, stale + hygiene):
            with self.subTest(log=log):
                route = classes.classify(red('PR Size Guard'), {'PR Size Guard': log})
                self.assertEqual((route['cls'], route['action']), ('tracked-byte-stale', 'sync-main'))

    def test_combined_tree_overflow_syncs_main_and_ignores_the_receipt_follower(self):
        log = (
            '2026-11-15T05:42:55.9330300Z ##[error]207672844 bytes of tracked regular files '
            '(merged tree; base 207583562 +89282) exceeds the 207618048-byte combined-tree budget; '
            'the merge queue would reject this PR\n'
            '2026-11-15T05:42:55.9418422Z ##[error]Process completed with exit code 1.\n'
            '2026-11-15T05:42:56.0668553Z ##[error]No files were found with the provided path: '
            'repo-health-receipt.json. No artifacts will be uploaded.\n')
        route = classes.classify(red('PR Size Guard'), {'PR Size Guard': log})
        self.assertEqual((route['cls'], route['action']), ('tree-byte-budget', 'sync-main'))
        hygiene = (
            '[repo-hygiene] blocked:\n'
            '  - 198.05 MiB of tracked regular files exceeds the 198.00 MiB repository budget\n'
            '##[error]Process completed with exit code 1.\n')
        again = classes.classify(red('PR Size Guard'), {'PR Size Guard': hygiene})
        self.assertEqual((again['cls'], again['action']), ('tree-byte-budget', 'sync-main'))

    def test_a_second_size_guard_error_stays_with_the_agent(self):
        log = (
            '##[error]207672844 bytes of tracked regular files (merged tree; base 207583562 +89282) '
            'exceeds the 207618048-byte combined-tree budget; the merge queue would reject this PR\n'
            '##[error]changed lines 1600 exceed the 1500 line cap\n')
        route = classes.classify(red('PR Size Guard'), {'PR Size Guard': log})
        self.assertEqual(route['action'], 'agent')

    def test_a_non_budget_hygiene_bullet_stays_with_the_agent(self):
        budget = '  - 198.05 MiB of tracked regular files exceeds the 198.00 MiB repository budget\n'
        other = '  - docs/example.tmp: temporary/backup files are not tracked\n'
        for header, bullets in (('', budget + other), ('', other + budget),
                               ('[repo-hygiene] blocked:\n', budget + other),
                               ('[repo-hygiene] blocked:\n', other + budget)):
            log = header + bullets + '##[error]Process completed with exit code 1.\n'
            for prefix in ('', '2026-11-15T05:42:55.9330300Z ',
                           'PR Size Guard\tUNKNOWN STEP\t2026-11-15T05:42:55.9330300Z '):
                with self.subTest(bullets=bullets, prefix=prefix):
                    prefixed = ''.join(prefix + line + '\n' for line in log.splitlines())
                    route = classes.classify(red('PR Size Guard'), {'PR Size Guard': prefixed})
                    self.assertEqual(route['action'], 'agent')


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


class RouteBudgetRoutingTest(unittest.TestCase):
    def test_route_budget_ratchet_syncs_main_before_mocked_infra_noise(self):
        # PR #25125: main tightened budgets while this head retained the old
        # file. Both the build guard and the CLI integration test report growth.
        errors = [
            "2026-11-13T02:54:35.2625435Z ##[error]routes./app/chat/[id] grew 823 -> 1385",
            "AssertionError: ::error::routes./app/chat grew 822 -> 1385",
            "::error::firstLoad.baselines./start grew 804 -> 1247",
            "::error::groups.dashboard.baselineKb grew 1199 -> 1385",
        ]
        for error in errors:
            log = "passing fixture: API rate limit exceeded; github-quota-deferred\n" + error
            got = classes.classify(red("Exact-head Coverage"), {"Exact-head Coverage": log})
            self.assertEqual((got["cls"], got["action"]), ("route-budget-growth", "sync-main"), error)
        # Measurement overruns and passing test titles are not stale-policy proof.
        for text in ["routes./app/chat grew 822 -> 1385", "✔ rejects routes./app/chat grew 822 -> 1385",
                     "::error::/app/chat: 1400 KB exceeds 822 KB budget", "::error::routes./app/chat grew invalid"]:
            got = classes.classify(red("Exact-head Coverage"), {"Exact-head Coverage": text})
            self.assertEqual((got["cls"], got["action"]), ("other", "agent"), text)


if __name__ == '__main__':
    unittest.main()
