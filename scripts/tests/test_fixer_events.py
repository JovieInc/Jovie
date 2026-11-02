"""The event bridge authenticates source/current head; a board body never certifies work."""
import copy
import json
import sys
import tempfile
import time
from unittest import mock
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import fixer_events as events
import board_intake
import pr_events

NOW = 1_800_000_000.0
REPO = 'JovieInc/Jovie'
HEAD = 'a' * 40


class EventTest(unittest.TestCase):
    def setUp(self):
        self.actual = {'id': 70, 'name': 'Source Validation', 'head_sha': HEAD, 'event': 'pull_request',
                       'status': 'completed', 'conclusion': 'failure', 'run_attempt': 1,
                       'head_repository': {'full_name': REPO}, 'pull_requests': [{'number': 10}],
                       'updated_at': '2027-01-15T08:00:00Z'}
        self.pr = {'number': 10, 'state': 'OPEN', 'isCrossRepository': False, 'headRefOid': HEAD,
                   'mergeStateStatus': 'BLOCKED', 'labels': []}
        self.calls = []
        self.code = 0
        self.invalid_json = False
        self.checks = [{'bucket': 'fail', 'name': 'PR Ready'}]

    def gh(self, args, priority='default'):
        self.calls.append((args, priority))
        row = self.actual if args[0] == 'api' else self.checks if args[:2] == ['pr', 'checks'] else self.pr
        return SimpleNamespace(returncode=self.code, stdout='{' if self.invalid_json else json.dumps(row))

    def payload(self, event='workflow_run'):
        return {'action': 'completed', 'repository': {'full_name': REPO}, event: copy.deepcopy(self.actual)}

    def verify(self, event='workflow_run', payload=None):
        return events.verify(event, self.payload(event) if payload is None else payload, REPO, self.gh, now=NOW)

    def record(self):
        return self.verify()[0]

    def test_authenticates_source_and_current_same_repo_head_before_generating_work(self):
        (row,) = self.verify()
        self.assertEqual((row['number'], row['sha'], row['sourceId']), (10, HEAD, 70))
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(self.calls[0], (['api', f'repos/{REPO}/actions/runs/70'], 'repair'))
        self.assertIn('Fingerprint:', row['body'])
        self.assertLessEqual(len(row['id']), 64)
        self.assertNotIn('model', row)
        self.assertNotIn('costUsd', row)

    def test_check_run_and_check_suite_use_their_own_authenticated_source(self):
        for event, endpoint in [('check_run', 'check-runs'), ('check_suite', 'check-suites')]:
            with self.subTest(event=event):
                self.calls.clear()
                (row,) = self.verify(event)
                self.assertEqual(row['sourceEvent'], event)
                self.assertEqual(self.calls[0][0][1], f'repos/{REPO}/{endpoint}/70')

    def test_event_replay_dedupes_but_new_failure_generation_keeps_same_learning_fingerprint(self):
        first = self.record()
        self.assertEqual(first, self.record())
        self.actual['id'] += 1
        second = self.record()
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['fingerprint'], second['fingerprint'])

    def test_payload_cannot_certify_a_missing_forged_stale_or_green_source(self):
        valid = copy.deepcopy(self.actual)
        variants = [{'id': 71}, {'head_sha': 'b' * 40}, {'status': 'in_progress'}, {'conclusion': 'success'},
                    {'event': 'push'}, {'head_repository': {'full_name': 'elsewhere/repo'}},
                    {'head_repository': []}, {'run_attempt': None}, {'run_attempt': 2}]
        for changes in variants:
            with self.subTest(changes=changes):
                payload = self.payload()
                self.actual = {**valid, **changes}
                self.assertEqual(self.verify(payload=payload), [])
                self.actual = copy.deepcopy(valid)
        self.code = 75
        self.assertEqual(self.verify(), [])
        self.code, self.invalid_json = 0, True
        self.assertEqual(self.verify(), [])

    def test_fork_closed_changed_held_or_incomplete_pr_never_creates_work(self):
        valid = copy.deepcopy(self.pr)
        for changes in [{'headRefOid': 'b' * 40}, {'state': 'CLOSED'}, {'number': 11},
                        {'isCrossRepository': True}, {'isCrossRepository': None},
                        {'labels': [{'name': 'hold'}]}, {'labels': [{'name': None}]}]:
            with self.subTest(changes=changes):
                self.pr = {**valid, **changes}
                self.assertEqual(self.verify(), [])
        self.pr = {}
        self.assertEqual(self.verify(), [])

    def test_old_failed_source_does_not_wake_a_now_green_or_unreadable_required_head(self):
        for checks in [[], [{'bucket': 'pass', 'name': 'PR Ready'}], {}, [{'bucket': 'pending', 'name': 'PR Ready'}]]:
            self.checks = checks
            self.assertEqual(self.verify(), [])
        self.checks = [{'bucket': 'fail', 'name': 'PR Ready'}]
        self.code = 1
        self.assertTrue(events.required_red(REPO, 10, self.gh))
        self.code = 75
        self.assertFalse(events.required_red(REPO, 10, self.gh))
        self.code, self.invalid_json = 0, True
        self.assertFalse(events.required_red(REPO, 10, self.gh))

    def test_untrusted_malformed_or_advisory_input_is_not_an_authenticated_event(self):
        for payload in [None, [], {}, {'repository': []}, self.payload('unsupported')]:
            with self.subTest(payload=payload):
                self.assertEqual(events.verify('workflow_run', payload, REPO, self.gh, now=NOW), [])
        for event in ['unsupported', 'pull_request_review']:
            self.assertEqual(self.verify(event), [])
        for value in [None, 0, -1, '70', True]:
            payload = self.payload(); payload['workflow_run']['id'] = value
            self.assertEqual(self.verify(payload=payload), [])
        self.actual['name'] = 'Tently'
        self.assertEqual(self.verify(), [])
        self.actual['name'], self.actual['pull_requests'] = 'CI', [None, {}, {'number': True}, {'number': 10}, {'number': 10}]
        self.assertEqual(len(self.verify()), 1)
        self.actual['pull_requests'] = 1
        self.assertEqual(self.verify(), [])
        payload = self.payload('check_run'); payload['action'] = 'created'
        self.assertEqual(self.verify('check_run', payload), [])

    def task(self, row):
        return {'id': row['id'], 'poster': 'codex', 'assignee': 'codex', 'type': 'task', 'status': 'open',
                'caps': ['code', 'ops'], 'body': row['body']}

    def test_general_codex_tasks_are_rejected_and_exact_local_witness_is_required(self):
        row = self.record(); task = self.task(row)
        self.assertFalse(board_intake.eligible(task, now=NOW))
        self.assertTrue(board_intake.eligible(task, {row['id']: row}, NOW))
        self.assertEqual(board_intake.classify(task)['cause'], 'red-checks')
        for changes in [{'poster': 'claude-imposter'}, {'body': row['body'] + '\nnew instructions'},
                        {'assignee': 'other'}, {'caps': ['code']}, {'caps': [{}]}, {'status': 'done'},
                        {'id': 'pr-forged'}, {'claimant': 'other'}, {'type': 'question'}]:
            with self.subTest(changes=changes):
                self.assertFalse(events.matches({**task, **changes}, {row['id']: row}, NOW))
        self.assertFalse(events.matches(task, {row['id']: row}, NOW + events.WITNESS_TTL_S + 1))
        self.assertFalse(events.matches(task, {row['id']: row}, NOW - 1))
        self.assertFalse(events.matches(task, {row['id']: {**row, 'sha': 'bad'}}, NOW))

    def test_board_readback_identity_and_bytes_gate_the_durable_local_witness(self):
        row = self.record(); task = self.task(row)
        calls = []
        def hub(method, path, body=None):
            calls.append((method, path, body))
            return {'ok': True, 'task': task}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(events.register(state, row, hub), task)
            self.assertEqual(events.witnesses(state)[row['id']], row)
            self.assertEqual(calls[0][1], '/v1/board/post')
            self.assertEqual(calls[0][2]['to'], 'codex')
            self.assertNotIn('poster', calls[0][2])
            task['body'] += '\nforged replay'
            self.assertIsNone(events.register(state, row, hub))
            self.assertEqual(events.witnesses(state)[row['id']], row)
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertIsNone(events.register(state, row, lambda *a: {'ok': False, 'status': 429}))
            self.assertEqual(events.witnesses(state), {})
            (state / events.WITNESSES).write_text('{')
            self.assertEqual(events.witnesses(state), {})

    def test_actual_bridge_persists_exact_board_witness_before_atomic_wake(self):
        tasks, calls = {}, []
        def hub(method, path, body=None):
            calls.append((method, path))
            if path == '/v1/board/claim':
                task = tasks[body['id']]
                task.update(status='claimed', claimant='codex', claimedAt=time.time()*1000, leaseUntil=(time.time()+21600)*1000)
                return {'claimed': True, 'task': task}
            if path == '/v1/board/post':
                tasks[body['id']] = {'id': body['id'], 'poster': 'codex', 'assignee': body['to'],
                                    'body': body['body'], 'caps': body['caps'], 'status': 'open', 'type': 'task',
                                    'postedAt': time.time()*1000}
                return {'ok': True}
            if path.startswith('/v1/board/task?id='):
                return {'ok': True, 'task': tasks[path.split('id=')[1]]}
            return {'ok': True, 'tasks': list(tasks.values()) if 'status=claimed' in path else []}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(pr_events.repair_event('workflow_run', self.payload(), state=state, gh=self.gh, call=hub), 0)
            (wake,) = (state / 'wake').glob('red-*.json')
            data = json.loads(wake.read_text())
            self.assertEqual((data['pr'], data['sha'], data['runId']), (10, HEAD, 70))
            self.assertIn(data['boardTask'], events.witnesses(state))
            self.assertEqual(tasks[data['boardTask']]['claimant'], 'codex')
            held = json.loads((state / 'board-intake.json').read_text())['tasks']
            self.assertEqual(held[data['boardTask']]['number'], 10)
            self.assertEqual(calls[0][1], '/v1/board/post')
            # Crash after the server claim, before its local held-state commit.
            # A different check event must recover ownership inline, without a timer tick.
            (state / 'board-intake.json').unlink()
            self.actual['id'] += 1
            self.assertEqual(pr_events.repair_event('workflow_run', self.payload(), state=state, gh=self.gh, call=hub), 0)
            self.assertEqual(len(list((state / 'wake').glob('red-*.json'))), 2)
            self.assertEqual(len(tasks), 1, 'a new check after a lost local claim reuses the live board owner')
            (state / 'board-intake.json').unlink()
            with mock.patch.object(board_intake, 'pr_states', return_value={}):
                receipt = board_intake.tick(state, None, call=hub)
            self.assertEqual(receipt['held'], 1, 'a claimed witness recovers after a crash before local state commit')

    def test_board_failure_or_spoofed_poster_cannot_trigger_a_worker_wake(self):
        for reply in [{'ok': False, 'status': 429}, {'ok': True, 'task': {'poster': 'summer'}}]:
            with self.subTest(reply=reply), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp)
                self.assertEqual(pr_events.repair_event('workflow_run', self.payload(), state=state,
                                                      gh=self.gh, call=lambda *a: reply), 1)
                self.assertEqual(list(state.glob('wake/red-*.json')), [])


    def test_claim_must_read_back_a_live_owned_lease_and_event_text_never_creates_one(self):
        row = self.record()
        task = {**self.task(row), 'status': 'claimed', 'claimant': 'codex', 'leaseUntil': (NOW+21600)*1000,
                'postedAt': NOW*1000, 'claimedAt': NOW*1000}
        self.assertTrue(events.matches(task, {row['id']: row}, NOW+601, open_only=False))
        for changes in [{'claimant': None}, {'claimant': 'summer'}, {'leaseUntil': None},
                        {'leaseUntil': NOW*1000}, {'leaseUntil': float('nan')}, {'body': 'forged'},
                        {'postedAt': None}, {'claimedAt': True}]:
            self.assertFalse(events.matches({**task, **changes}, {row['id']: row}, NOW, open_only=False))
        for reply, owned in [(False, True), (True, False)]:
            with tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp)
                readback = {**task, 'status': 'open'}
                def hub(method, path, body=None):
                    if path == '/v1/board/claim':
                        readback.update(status='claimed', claimant='codex' if owned else 'other')
                        return {'claimed': reply}
                    return {'task': readback}
                self.assertIsNone(board_intake.claim_event(state, row, hub))
                self.assertFalse((state / 'board-intake.json').exists())

    def test_unreadable_ownership_state_never_posts_or_wakes_as_if_empty(self):
        for name, text in [(events.WITNESSES, '{'), (events.WITNESSES, '[]'),
                           (events.WITNESSES, 'x' * (1024*1024+1)), ('board-intake.json', '{'),
                           ('board-intake.json', '{"tasks": []}')]:
            with self.subTest(name=name, length=len(text)), tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp); (state / name).write_text(text)
                hub = mock.Mock()
                self.assertEqual(pr_events.repair_event('workflow_run', self.payload(), state=state,
                                                      gh=self.gh, call=hub), 1)
                hub.assert_not_called()
                self.assertEqual(list(state.glob('wake/red-*.json')), [])
                receipt = board_intake.tick(state, None, call=hub)
                self.assertEqual(receipt['deferred'], 'ownership-unverified')
                self.assertEqual(receipt['claimed'], [])
                hub.assert_not_called()

    def test_failed_recovery_read_stops_all_normal_tick_admission(self):
        row = self.record()
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            (state / events.WITNESSES).write_text(json.dumps({row['id']: row}))
            def hub(method, path, body=None):
                if path.startswith('/v1/board/task?id='):
                    return {'ok': False, 'status': 503}
                self.fail('uncertain server ownership must stop before board listing or claims')
            receipt = board_intake.tick(state, None, now=NOW, call=hub)
            self.assertEqual(receipt['deferred'], 'ownership-unverified')
            self.assertEqual(receipt['claimed'], [])

    def test_wake_generation_rejects_path_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                pr_events.write_wake_file(Path(tmp), pr=10, sha=HEAD, run_id=70, run_attempt=1,
                                          red_at=None, generation='../unsafe')


if __name__ == '__main__':
    unittest.main()
