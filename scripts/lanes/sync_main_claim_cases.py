"""Sync-main claim cases for the routing tests.

Company Guards rejects an unbaselined source file over 500 lines. These cases
stay beside the lane modules so the routing test file can subclass them
without a second test module or a longer lane_runner list.
"""
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import atomic_state
import fix_red_classes as classes
import fix_red_failure_routing as routing
import lane_runner as lane


class SyncClaimTest(unittest.TestCase):
    def test_sync_claim_qualifies_only_sync_main(self):
        tip, other = 'ab' * 20, 'cd' * 20
        for pr, action, want in (
            ({'baseRef': {'target': {'oid': tip}}}, 'sync-main', f'sync-main:{tip}'),
            ({'baseRefOid': tip}, 'sync-main', f'sync-main:{tip}'),
            ({}, 'sync-main', 'sync-main'),
            ({'baseRefOid': 'not-a-sha'}, 'sync-main', 'sync-main'),
            ({'baseRefOid': tip}, 'rerun', 'rerun'),
        ):
            self.assertEqual(routing.sync_claim(pr, action), want)
        self.assertEqual((routing.base_tip({'baseRef': {'target': {'oid': other}}, 'baseRefOid': tip}), routing.base_tip(None)), (other, ''))

    def test_burned_claim_syncs_again_when_the_base_tip_changes(self):
        with tempfile.TemporaryDirectory() as name:
            host = lane.Host(state=Path(name))
            head, tip_a, tip_b = 'c' * 40, 'd' * 40, 'e' * 40
            atomic_state.atomic_write_text(
                host.state / 'class-routes.json',
                json.dumps({'25910': {'sync-main': head}}),
            )
            pr = {'number': 25910, 'headRefOid': head, 'baseRefOid': tip_a, 'body': ''}
            route = {'action': 'sync-main', 'cls': 'tracked-byte-stale'}

            def finished(*_args, **_kwargs):
                # Production sync_main writes this receipt before it returns.
                atomic_state.atomic_write_text(
                    host.state / 'synced.json',
                    json.dumps({'25910': {'from': head, 'ok': True}}),
                )
                return 'synced'

            with patch.object(lane.pr_events, 'sync_main', side_effect=finished) as sync:
                self.assertEqual(lane.deterministic_route_taken(host, pr, route), 'infra-rerun:tracked-byte-stale')
                self.assertIsNone(lane.deterministic_route_taken(host, pr, route))
                pr['baseRefOid'] = tip_b
                self.assertEqual(lane.deterministic_route_taken(host, pr, route), 'infra-rerun:tracked-byte-stale')
            saved = json.loads((host.state / 'class-routes.json').read_text())['25910']
            self.assertEqual((sync.call_count, saved['sync-main'], saved[f'sync-main:{tip_b}']), (2, head, head))


class StuckSyncRetryTest(unittest.TestCase):
    def setUp(self):
        self.head = 'a' * 40
        self.pr = {'number': 25257, 'headRefOid': self.head}
        self.routes = {'25257': {'sync-main': self.head}}
        self.host = types.SimpleNamespace(state=Path(tempfile.mkdtemp()))
        self.route = {'action': 'sync-main', 'cls': 'design-source-cli'}

    def test_missing_receipt_is_clean_only_for_this_head(self):
        claim = lane.fix_red_failure_routing.stuck_sync_is_clean
        rows = [
            (self.pr, self.routes, {}, True, True),
            (self.pr, self.routes, {'25257': {'from': 'b' * 40, 'ok': True}}, True, True),
            (self.pr, self.routes, {}, False, False),
            (self.pr, self.routes, {}, None, False),
            (self.pr, {}, {}, True, False),
            (self.pr, {'25257': {'sync-main': 'c' * 40}}, {}, True, False),
            (self.pr, self.routes, {'25257': {'from': self.head, 'ok': False}}, True, False),
            ({'number': '25257', 'headRefOid': self.head}, self.routes, {}, True, False),
            (self.pr, self.routes, [], True, False),
            ({**self.pr, 'baseRefOid': 'd' * 40},
             {'25257': {'sync-main:' + 'd' * 40: self.head}}, {}, True, True),
            ({**self.pr, 'baseRefOid': 'd' * 40}, self.routes, {}, True, False),
        ]
        for pr, routes, synced, clean, expected in rows:
            self.assertIs(claim(pr, routes, synced, clean), expected)
        self.assertEqual((classes.RERUN, classes.SYNC_MAIN), ('rerun', 'sync-main'))

    def _taken(self, synced, conflicts):
        with patch.object(lane, 'claim_route', return_value=False), \
                patch.object(lane, 'read_json', side_effect=[self.routes, synced]), \
                patch.object(lane, 'conflict_files', return_value=conflicts) as merged, \
                patch.object(lane.pr_events, 'sync_main', return_value='synced') as sync:
            reason = lane.deterministic_route_taken(self.host, self.pr, self.route)
        return reason, merged, sync

    def test_route_retries_sync_once_when_the_merge_is_clean(self):
        reason, merged, sync = self._taken({}, [])
        self.assertEqual((reason, merged.call_count, sync.call_count), ('infra-rerun:design-source-cli', 1, 1))
        reason, merged, sync = self._taken({'25257': {'from': self.head, 'ok': False}}, [])
        self.assertEqual((reason, merged.call_count, sync.call_count), (None, 0, 0))
        reason, merged, sync = self._taken({}, ['apps/web/a.tsx'])
        self.assertEqual((reason, merged.call_count, sync.call_count), (None, 1, 0))

    def test_qualified_tip_without_a_receipt_retries_only_when_the_merge_is_clean(self):
        tip = 'd' * 40
        pr = {**self.pr, 'baseRefOid': tip}
        routes = {'25257': {f'sync-main:{tip}': self.head}}
        with patch.object(lane, 'claim_route', return_value=False), \
                patch.object(lane, 'read_json', side_effect=[routes, {}]), \
                patch.object(lane, 'conflict_files', return_value=[]) as merged, \
                patch.object(lane.pr_events, 'sync_main', return_value='synced') as sync:
            reason = lane.deterministic_route_taken(self.host, pr, self.route)
        self.assertEqual((reason, merged.call_count, sync.call_count),
                         ('infra-rerun:design-source-cli', 1, 1))
        with patch.object(lane, 'claim_route', return_value=False), \
                patch.object(lane, 'read_json', side_effect=[routes, {}]), \
                patch.object(lane, 'conflict_files', return_value=['scripts/lanes/lane_runner.py']) as blocked, \
                patch.object(lane.pr_events, 'sync_main', return_value='synced') as sync:
            reason = lane.deterministic_route_taken(self.host, pr, self.route)
        self.assertEqual((reason, blocked.call_count, sync.call_count), (None, 1, 0))
