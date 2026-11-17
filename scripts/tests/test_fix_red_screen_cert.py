import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import fix_red_screen_cert  # noqa: E402

GATE = (
    "screen certificate gate failed:\n"
    "  apps/web/components/jovie/merch-tool-artifacts.tsx "
    "[states missing empty, error, partial, long-content, offline, rtl-overflow, a11y] "
    "on onboarding/start, chat/app-chat\n"
)


def pr():
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": "Source Validation", "conclusion": "FAILURE"},
        {"name": "PR Ready", "conclusion": "FAILURE"}]}


class ScreenCertRouteTest(unittest.TestCase):
    def test_gate_line_routes_to_the_repair_and_keeps_the_component(self):
        got = classes.classify(pr(), {"Source Validation": GATE})
        self.assertEqual((got["cls"], got["action"]), ("screen-certificate", "repair-screen-cert"))
        self.assertEqual(got["files"], ["apps/web/components/jovie/merch-tool-artifacts.tsx"])

    def test_rate_limit_noise_in_the_same_log_does_not_steal_the_class(self):
        log = "HttpError: API rate limit exceeded for installation\ngithub-quota-deferred\n" + GATE
        got = classes.classify(pr(), {"Source Validation": log})
        self.assertEqual(got["cls"], "screen-certificate")
        self.assertEqual(got["action"], "repair-screen-cert")

    def test_a_log_without_the_gate_is_not_this_class(self):
        got = classes.classify(pr(), {"Source Validation": "AssertionError: expected 1"})
        self.assertNotEqual(got["cls"], "screen-certificate")

    def test_paths_extract_only_the_failed_component_lines(self):
        self.assertEqual(
            fix_red_screen_cert.screen_cert_paths(GATE + "  not a path\n"),
            ["apps/web/components/jovie/merch-tool-artifacts.tsx"])

    def test_dispatch_keeps_existing_fixers_and_skips_a_route_with_no_tsx(self):
        calls = []

        def sh(*_args, **_kwargs):
            calls.append(True)

        fixers = {name: object() for name in ("wire", "atomic", "renumber", "snap", "strip", "merge", "register")}
        table = fix_red_screen_cert.dispatch(classes, sh, fixers)
        self.assertIs(table[classes.WIRE_CI_FAST], fixers["wire"])
        self.assertIs(table[classes.REGISTER_DOMAIN], fixers["register"])
        repair = table[classes.REPAIR_SCREEN_CERT]
        self.assertIsNone(repair(None, {"headRefName": "merch/pr5"}, {"files": []}, None, None, {}))
        self.assertIsNone(repair(None, {"headRefName": "merch/pr5"}, {"files": ["README.md"]}, None, None, {}))
        self.assertEqual(calls, [])

    def test_ui_feel_fixer_calls_the_publisher(self):
        calls = []

        def publish(*args):
            calls.append(args)
            return "pushed"

        stub = types.SimpleNamespace(
            WIRE_CI_FAST="wire", ATOMIC_WRITE="atomic", RENUMBER="renumber",
            SNAP_SPACING="snap", STRIP_CACHE="strip", MERGE_NARROWED="merge",
            REGISTER_DOMAIN="register", REPAIR_SCREEN_CERT="screen",
            UI_FEEL="ui-feel", publish_ui_feel=publish)
        fixers = {name: object() for name in ("wire", "atomic", "renumber", "snap", "strip", "merge", "register")}
        fixers["ui"] = fix_red_screen_cert.bind_ui_feel("sh", "logs", stub)
        table = fix_red_screen_cert.dispatch(stub, None, fixers)
        self.assertIs(table["ui-feel"], fixers["ui"])
        self.assertEqual(
            table["ui-feel"]("host", {"number": 1}, {"files": []}, "tree", "log", {}),
            "pushed")
        self.assertEqual(calls, [("sh", "logs", "host", {"number": 1}, "tree", "log", {})])

    def test_dispatch_routes_heading_balance_through_the_rewrite(self):
        calls = []

        def sh(args, **_kwargs):
            calls.append(args)
            if args[:2] == ["git", "diff"]:
                return SimpleNamespace(returncode=0, stdout="")
            return SimpleNamespace(returncode=0, stdout="")

        fixers = {name: object() for name in ("wire", "atomic", "renumber", "snap", "strip", "merge", "register")}
        table = fix_red_screen_cert.dispatch(classes, sh, fixers)
        balance = table[classes.BALANCE_HEADINGS]
        self.assertIsNone(balance(None, {"headRefName": "claude/align"}, {}, Path("."), None, {}))
        self.assertEqual(calls[0][:3], ["git", "diff", "-U0"])


if __name__ == "__main__":
    unittest.main()
