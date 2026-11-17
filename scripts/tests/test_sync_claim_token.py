"""sync-main claims retry when the live base tip moves, and only then."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import fix_red_classes as classes
import fix_red_failure_routing as routing
import lane_runner as lane


class SyncClaimTokenTest(unittest.TestCase):
    def setUp(self):
        self.head = 'a' * 40
        self.tip_a = 'b' * 40
        self.tip_b = 'c' * 40

    def pr(self, tip=None, **extra):
        row = {'number': 25802, 'headRefOid': self.head, **extra}
        if tip is not None:
            row['baseRef'] = {'target': {'oid': tip}}
        return row

    def test_sync_main_retries_only_when_the_live_base_tip_moves(self):
        first = routing.sync_claim_token(None, self.pr(self.tip_a), classes.SYNC_MAIN)
        self.assertEqual(first, f'{self.head}:{self.tip_a}')
        self.assertIsNone(routing.sync_claim_token(first, self.pr(self.tip_a), classes.SYNC_MAIN))
        self.assertEqual(
            routing.sync_claim_token(first, self.pr(self.tip_b), classes.SYNC_MAIN),
            f'{self.head}:{self.tip_b}')

    def test_legacy_head_claim_allows_one_sync_once_the_tip_is_known(self):
        self.assertEqual(
            routing.sync_claim_token(self.head, {'headRefOid': self.head, 'baseTipOid': self.tip_a}, classes.SYNC_MAIN),
            f'{self.head}:{self.tip_a}')

    def test_stale_merge_base_and_a_missing_tip_do_not_mint_another_sync(self):
        stale = {'headRefOid': self.head, 'baseRefOid': 'd' * 40, 'baseRef': {'target': {'oid': 'not-a-sha'}}}
        self.assertEqual(routing.sync_claim_token(None, stale, classes.SYNC_MAIN), self.head)
        self.assertIsNone(routing.sync_claim_token(self.head, stale, classes.SYNC_MAIN))
        recorded = f'{self.head}:{self.tip_a}'
        self.assertIsNone(routing.sync_claim_token(recorded, {'headRefOid': self.head}, classes.SYNC_MAIN))

    def test_other_actions_stay_once_per_head(self):
        pr = self.pr(self.tip_a)
        self.assertEqual(routing.sync_claim_token(None, pr, 'stamp-changelog'), self.head)
        self.assertIsNone(routing.sync_claim_token(self.head, pr, 'stamp-changelog'))
        moved = {**pr, 'headRefOid': self.tip_b}
        self.assertEqual(routing.sync_claim_token(self.head, moved, 'stamp-changelog'), self.tip_b)

    def test_claim_route_records_the_tip_and_allows_the_next_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp))
            pr = self.pr(self.tip_a)
            self.assertTrue(lane.claim_route(host, pr, classes.SYNC_MAIN))
            self.assertFalse(lane.claim_route(host, pr, classes.SYNC_MAIN))
            self.assertTrue(lane.claim_route(host, self.pr(self.tip_b), classes.SYNC_MAIN))
            stored = json.loads((Path(tmp) / 'class-routes.json').read_text())
            self.assertEqual(stored['25802'][classes.SYNC_MAIN], f'{self.head}:{self.tip_b}')
            self.assertTrue(lane.claim_route(host, pr, 'stamp-changelog'))
            self.assertFalse(lane.claim_route(host, self.pr(self.tip_b), 'stamp-changelog'))


if __name__ == '__main__':
    unittest.main()
