import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import fix_red_classes as classes  # noqa: E402


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
        paired = classes.classify(pr("A", "B"), {
            "A": "API rate limit exceeded",
            "B": "Unwired: scripts/a.test.mjs. Wire each file into a ci-fast lane",
        })
        self.assertEqual(paired["actions"], ["wire-ci-fast", "rerun"])


if __name__ == "__main__":
    unittest.main()
