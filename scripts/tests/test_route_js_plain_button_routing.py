"""Ships-N-KB gzip growth and PlainButton scope stay source repairs.

Split from test_fix_red_failure_routing.py so that file stays within the
500-line company budget. Self-contained: the lanes release stages only
LANE_TESTS, so this file does not import another test.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lanes'))
import fix_red_classes as classes

HEAD = '99320365a5ba5f03eb7cfd48c1a10137bd3d4031'


def red(*names):
    return {
        'number': 23211,
        'headRefOid': HEAD,
        'headRefName': 'fix/apple-music-visitor-storefront',
        'url': 'https://github.com/JovieInc/Jovie/pull/23211',
        'mergeStateStatus': 'BLOCKED',
        'eventKinds': ['dequeued'],
        'queueFailure': '',
        'statusCheckRollup': [{'name': name, 'conclusion': 'FAILURE'} for name in names],
    }


class RouteJsAndPlainButtonRoutingTest(unittest.TestCase):
    SHIP = ("##[error]/app/admin/room ships 688 KB gzip initial JS; its baseline is "
            "687 KB (+1 KB). Split or lazy-load the client code this change added.")
    PLAIN = ("AssertionError: Use Button from @jovie/ui. PlainButton is only for the "
             "approved files in plain-button-scope.json.: expected [ 'components/molecules/drawer/DrawerPropertyRow.tsx' ] to deeply equal []")

    def test_ships_annotation_shrinks_client_js_and_does_not_sync_main(self):
        import fix_red_failure_routing as routing
        log = "passing fixture: API rate limit exceeded\n2026-11-17T08:22:57.4858803Z " + self.SHIP + "\n"
        got = classes.classify(red("Exact-head Coverage"), {"Exact-head Coverage": log})
        self.assertEqual((got["cls"], got["action"]), ("route-js-initial-growth", "agent"))
        decision = routing.route_js_shrink_decision(log)
        self.assertEqual(decision["route"], "/app/admin/room")
        self.assertEqual(decision["repair"], "shrink-client-js")
        self.assertEqual(decision["forbid"], "raise-baseline")
        self.assertEqual(decision["deltaKb"], 1)
        # A non-increasing measurement is not this repair, and the grew-line stays a sync.
        self.assertIsNone(routing.route_js_shrink_decision(
            "##[error]/app/admin/room ships 687 KB gzip initial JS; its baseline is 687 KB (+0 KB)."))
        grew = classes.classify(red("Exact-head Coverage"), {
            "Exact-head Coverage": "##[error]routes./app/chat grew 822 -> 1385"})
        self.assertEqual((grew["cls"], grew["action"]), ("route-budget-growth", "sync-main"))

    def test_plain_button_scope_switches_to_button_and_does_not_grow_the_allowlist(self):
        import fix_red_failure_routing as routing
        log = "FAIL tests/unit/design-system/plain-button-scope.test.ts\n" + self.PLAIN + "\n"
        got = classes.classify(red("Affected Unit Tests (4/4)"), {"Affected Unit Tests (4/4)": log})
        self.assertEqual((got["cls"], got["action"]), ("plain-button-scope", "agent"))
        self.assertEqual(routing.plain_button_decision(log), {
            "repair": "replace-with-ui-button", "forbid": "grow-allowlist"})
        self.assertIsNone(routing.plain_button_decision("plain-button-scope.test.ts passed"))

    def test_the_pair_stays_a_source_repair_when_both_checks_fail(self):
        pr = red("Exact-head Coverage", "Affected Unit Tests (4/4)")
        logs = {
            "Exact-head Coverage": self.SHIP,
            "Affected Unit Tests (4/4)": self.PLAIN,
        }
        got = classes.classify(pr, logs)
        self.assertEqual(got["action"], "agent")
        self.assertNotEqual(got["cls"], "route-budget-growth")
        self.assertNotIn("sync-main", got["actions"])


if __name__ == '__main__':
    unittest.main()
