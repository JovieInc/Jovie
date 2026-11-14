import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402
import lane_runner as lane  # noqa: E402


def pr(*names, merge="BLOCKED"):
    return {"mergeStateStatus": merge, "statusCheckRollup": [{"name": n, "conclusion": "FAILURE"} for n in names]
            + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


class ComposeRouteTest(unittest.TestCase):
    def test_current_deterministic_leaves_are_preserved_when_main_adds_fixers(self):
        from fix_red_compose import compose_actions

        leaves = classes.DETERMINISTIC - {classes.ALIAS_ACTION}
        self.assertEqual(set(compose_actions(sorted(leaves))), leaves)
        self.assertEqual(compose_actions([classes.ALIAS_ACTION]), [])

    def test_remote_sync_cannot_compose_with_checkout_repairs(self):
        from fix_red_compose import composed_route

        self.assertEqual(composed_route([classes.SYNC_MAIN, classes.WIRE_CI_FAST], classes.COMPOSE, classes.AGENT),
                         ("mixed", classes.AGENT, []))

    def test_a_mixed_agent_head_has_no_leaf_actions(self):
        mixed = classes.classify(pr("A", "B"), {"A": "API rate limit exceeded", "B": "AssertionError"})
        self.assertEqual((mixed["cls"], mixed["action"]), ("mixed", "agent"))
        self.assertEqual(mixed["actions"], [])

    def test_every_deterministic_class_composes_and_a_model_class_does_not(self):
        missing = "Error: Customer outcome decision missing or invalid (missing-metadata)."
        unwired = ("AssertionError: Unwired: scripts/catalog-duplicate-report.test.mjs. "
                   "Wire each file into a ci-fast lane")
        logs = {"Source Validation": missing, "Affected Unit Tests (4/4)": unwired}
        got = classes.classify(pr("Source Validation", "Affected Unit Tests (4/4)"), logs)
        self.assertEqual((got["cls"], got["action"]), ("composed", "compose"))
        self.assertEqual(got["actions"], ["stamp-changelog", "wire-ci-fast"])
        self.assertEqual(got["files"], ["scripts/catalog-duplicate-report.test.mjs"])
        behind = classes.classify(
            pr("Source Validation", "Affected Unit Tests (4/4)", merge="BEHIND"), logs)
        self.assertEqual(behind["action"], "compose", "a fully deterministic head is not sync-only")
        shared = classes.classify(pr("Source Validation", "Exact-head Coverage"), {
            "Source Validation": "Error: apps/web/app/(marketing)/pricing/page.tsx: source changed; renew certification evidence",
            "Exact-head Coverage": (" FAIL  workspace-scripts lib/__tests__/design-system-source-ratchet.test.mjs"
                                    " > exits zero from the CLI on the live tree"),
        })
        self.assertEqual((shared["cls"], shared["action"]), ("composed", "sync-main"))
        self.assertEqual(shared["actions"], ["sync-main"])
        design = ("Source Validation\tUNKNOWN STEP\t2026-11-13T19:17:13.8426377Z "
                  " FAIL  workspace-scripts lib/__tests__/design-system-source-ratchet.test.mjs"
                  " > design-system source identity ratchet (JOV-5301)"
                  " > exits zero from the CLI on the live tree\n")
        budget = (
            "Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:13.5084741Z ##[error]routes./app/admin/hud grew 738 -> 975\n"
            "Exact-head Coverage\tUNKNOWN STEP\t2026-11-13T19:16:13.5103474Z ##[error]firstLoad.baselines./ grew 578 -> 663\n")
        inherited = classes.classify(pr("Source Validation", "Exact-head Coverage", merge="BLOCKED"), {
            "Source Validation": design, "Exact-head Coverage": budget})
        self.assertEqual((inherited["cls"], inherited["action"]), ("composed", "sync-main"))
        self.assertEqual(inherited["actions"], ["sync-main"])
        owned = classes.classify(pr("Source Validation", "Exact-head Coverage", merge="BLOCKED"), {
            "Source Validation": design,
            "Exact-head Coverage": budget + "AssertionError: expected 1\n"})
        self.assertEqual((owned["cls"], owned["action"]), ("mixed", "agent"))
        paired = classes.classify(pr("A", "B"), {
            "A": "API rate limit exceeded",
            "B": "Unwired: scripts/a.test.mjs. Wire each file into a ci-fast lane",
        })
        self.assertEqual(paired["actions"], ["wire-ci-fast", "rerun"])


class ComposeExecutionTest(unittest.TestCase):
    def test_composed_route_stamps_the_body_before_wiring_and_does_not_call_the_model(self):
        order = []
        route = {"action": "compose", "cls": "composed",
                 "actions": ["wire-ci-fast", "stamp-changelog"],
                 "files": ["scripts/catalog-duplicate-report.test.mjs"]}

        def stamp(pr, **kwargs):
            order.append("stamp")
            return True

        def wire(host, pr, route, worktree, log, receipt):
            order.append("wire")
            receipt["wiredFiles"] = list(route["files"])
            return SimpleNamespace(returncode=0)

        receipt = {}
        with patch.object(lane.pr_events, "ensure_red_before_green", side_effect=stamp), \
                patch.object(lane, "wire_ci_fast_fix", side_effect=wire), \
                patch.object(lane, "run_agent") as agent:
            done = lane.compose_deterministic_fix(None, {"number": 24816, "body": "bare"}, route, Path("."), None, receipt)
            self.assertIsNone(lane.deterministic_route_taken(None, {"body": "bare"}, route))
        self.assertEqual(order, ["stamp", "wire"])
        self.assertEqual(done.returncode, 0)
        self.assertEqual(receipt["resolution"], "composed-deterministic")
        self.assertEqual(receipt["composedActions"], ["stamp-changelog", "wire-ci-fast"])
        self.assertEqual(receipt["wiredFiles"], ["scripts/catalog-duplicate-report.test.mjs"])
        agent.assert_not_called()
        order.clear()

        def stamp_fails(pr, **kwargs):
            order.append("stamp")
            return False

        with patch.object(lane.pr_events, "ensure_red_before_green", side_effect=stamp_fails), \
                patch.object(lane, "wire_ci_fast_fix", side_effect=wire):
            self.assertIsNone(lane.compose_deterministic_fix(
                None, {"number": 24816, "body": "bare"}, route, Path("."), None, {}))
        self.assertEqual(order, ["stamp"])

    def test_composed_route_keeps_its_owner_after_another_loader_rebinds_lane_runner(self):
        route = {"actions": ["stamp-changelog", "wire-ci-fast"], "files": []}
        other = Mock()
        receipt = {}
        with patch.dict(sys.modules, {"lane_runner": other}), \
                patch.object(lane.pr_events, "ensure_red_before_green", return_value=True) as stamp, \
                patch.object(lane, "wire_ci_fast_fix", return_value=SimpleNamespace(returncode=0)) as wire:
            done = lane.compose_deterministic_fix(None, {}, route, Path("."), None, receipt)
        self.assertEqual(done.returncode, 0)
        stamp.assert_called_once()
        wire.assert_called_once()
        self.assertEqual(receipt["composedActions"], ["stamp-changelog", "wire-ci-fast"])
        self.assertEqual(other.mock_calls, [], "a new loader must not own an existing repair")

    def test_composed_stamp_preserves_fresh_repair_evidence(self):
        live = "## Red-before-green\n\n- Failing run: https://github.com/JovieInc/Jovie/actions/runs/42\n"
        written = []
        def gh(args, **kwargs):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout=live)
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0)
        with patch.object(lane, "gh_call", side_effect=gh), \
                patch.object(lane, "wire_ci_fast_fix", return_value=SimpleNamespace(returncode=0)):
            lane.compose_deterministic_fix(None,
                {"number": 24816, "body": "stale"}, {"actions": ["stamp-changelog", "wire-ci-fast"]}, Path("."), None, {})
        self.assertTrue(written[0].startswith(live))
        self.assertEqual(written[0].count("customer-changelog/v1"), 1)

if __name__ == "__main__":
    unittest.main()
