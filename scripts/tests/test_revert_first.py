"""Revert first, diagnose second (audit finding 3). Hermetic: inline fixtures, no clock, gh, git or network."""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# The release self-test uses unittest without pytest's conftest path setup.
sys.path.insert(0, str(ROOT / "scripts/lanes"))
os.environ.setdefault("LANES_EXECUTION_BACKEND", "local-test")
import remediation  # noqa: E402
import revert_first as rf  # noqa: E402

NAMED_AT = 2_000_000_000.0
GREEN, RED, OTHER = "a" * 40, "b" * 40, "c" * 40


def run(sha, conclusion, event="push", at="2026-11-11T10:00:00Z", rid=1):
    return {"head_sha": sha, "conclusion": conclusion, "event": event, "created_at": at,
            "updated_at": at.replace(":00Z", ":04Z"), "html_url": f"https://github.com/JovieInc/Jovie/actions/runs/{rid}"}


def commit(sha=RED, subject="feat(pricing): new tier copy (#24100)", author="itstimwhite", labels=()):
    return {"sha": sha, "subject": subject, "author": author, "pr": rf.parse_pr(subject), "labels": list(labels)}


# 2026-09-21: Dependabot moved the Vercel CLI 56 -> 59 and broke staging deploys for 5 days.
VERCEL_BUMP = commit(subject="build(deps-dev): bump vercel from 56.0.0 to 59.0.0 (#21876)", author="dependabot[bot]")
RED_AFTER_GREEN = [run(RED, "failure", rid=3, at="2026-11-11T10:05:00Z"), run(GREEN, "success", rid=2)]


class DependencyBumpTest(unittest.TestCase):
    def test_bots_labels_and_subjects_are_dependency_bumps(self):
        self.assertTrue(rf.is_dependency_bump(VERCEL_BUMP))
        self.assertTrue(rf.is_dependency_bump(commit(subject="Bump next from 15.1.0 to 16.0.1 (#1)")))
        self.assertTrue(rf.is_dependency_bump(commit(subject="chore(deps): update turbo (#2)")))
        self.assertTrue(rf.is_dependency_bump(commit(author="renovate[bot]")))
        self.assertTrue(rf.is_dependency_bump(commit(labels=["dependencies"])))

    def test_ordinary_changes_are_not(self):
        self.assertFalse(rf.is_dependency_bump(commit()))
        self.assertFalse(rf.is_dependency_bump(commit(subject="fix(deploy): bump retry count from 2 to 3 (#3)")))


class NameCulpritTest(unittest.TestCase):
    def test_first_red_push_one_commit_after_green_is_named(self):
        got = rf.name_culprit(RED_AFTER_GREEN, [commit()])
        self.assertEqual((got["status"], got["reason"]), ("named", "first-red-push"))
        self.assertEqual(got["culprit"]["sha"], RED)
        self.assertEqual(got["run"], "https://github.com/JovieInc/Jovie/actions/runs/3")
        self.assertEqual(got["redSince"], "2026-11-11T10:05:00Z")
        self.assertEqual((got["greenSha"], got["redEndedAt"]), (GREEN, "2026-11-11T10:05:04Z"))

    def test_the_oldest_red_run_of_the_streak_is_the_one_attributed(self):
        runs = [run(OTHER, "failure", rid=4), *RED_AFTER_GREEN]
        self.assertEqual(rf.name_culprit(runs, [commit()])["culprit"]["sha"], RED)

    def test_cancelled_and_skipped_runs_say_nothing(self):
        runs = [run(OTHER, "cancelled"), RED_AFTER_GREEN[0], run(OTHER, "skipped"), RED_AFTER_GREEN[1]]
        self.assertEqual(rf.name_culprit(runs, [commit()])["status"], "named")

    def test_red_on_an_unchanged_commit_is_a_time_bomb_with_no_culprit(self):
        # JOV-8737 (2026-11-10): a test expired by the clock; the idle probe re-ran the green commit and it failed.
        runs = [run(GREEN, "failure", event="workflow_dispatch"), run(GREEN, "success")]
        got = rf.name_culprit(runs, [])
        self.assertEqual((got["status"], got["reason"]), ("no-culprit", "red-on-an-unchanged-commit"))
        self.assertEqual(rf.decide(got)["action"], "none")

    def test_a_dispatch_run_that_turned_red_names_no_commit(self):
        runs = [run(RED, "failure", event="workflow_dispatch"), run(GREEN, "success")]
        self.assertEqual(rf.name_culprit(runs, [commit()])["reason"], "first-red-run-was-not-a-push")

    def test_several_commits_since_green_is_ambiguous_and_alerts(self):
        got = rf.name_culprit(RED_AFTER_GREEN, [commit(OTHER), commit()])
        self.assertEqual(got["status"], "ambiguous")
        self.assertEqual([c["sha"] for c in got["candidates"]], [OTHER, RED])
        self.assertEqual(rf.decide(got), {"action": "alert", "reason": "several-commits-since-green-needs-bisect"})

    def test_unreadable_or_mismatched_range_is_unknown(self):
        self.assertEqual(rf.name_culprit(RED_AFTER_GREEN, None)["reason"], "commit-range-unread")
        self.assertEqual(rf.name_culprit(RED_AFTER_GREEN, [])["reason"], "commit-range-does-not-end-at-the-red-commit")
        self.assertEqual(rf.name_culprit(RED_AFTER_GREEN, [commit(OTHER)])["status"], "unknown")

    def test_green_empty_and_all_red_windows(self):
        self.assertEqual(rf.name_culprit([run(GREEN, "success")], None)["status"], "green")
        self.assertEqual(rf.name_culprit([], None)["reason"], "no-main-health-runs")
        self.assertEqual(rf.name_culprit([RED_AFTER_GREEN[0]], None)["reason"], "no-green-run-in-window")


class DecideTest(unittest.TestCase):
    def named(self, culprit=None):
        return rf.name_culprit(RED_AFTER_GREEN, [culprit or commit()])

    def test_a_named_culprit_is_reverted(self):
        self.assertEqual(rf.decide(self.named()), {"action": "open-revert", "reason": "culprit-named"})

    def test_a_dependency_bump_is_always_reverted(self):
        self.assertEqual(rf.decide(self.named(VERCEL_BUMP)), {"action": "open-revert", "reason": "dependency-bump"})

    def test_mode_dry_and_off(self):
        self.assertEqual(rf.decide(self.named(), mode="dry")["action"], "dry-revert")
        self.assertEqual(rf.decide(self.named(), mode="off"), {"action": "skip", "reason": "kill-switch-off"})

    def test_one_revert_per_culprit(self):
        open_reverts = [{"number": 25010, "culprit": RED}]
        self.assertEqual(rf.decide(self.named(), open_reverts=open_reverts)["reason"], "revert-in-flight")
        self.assertEqual(rf.decide(self.named(), open_reverts=[{"culprit": OTHER}])["action"], "open-revert")

    def test_a_revert_is_never_reverted(self):
        culprit = commit(subject='Revert "feat(pricing): new tier copy (#24100)" (#24101)')
        self.assertEqual(rf.decide(self.named(culprit))["reason"], "culprit-is-a-revert")
        labeled = commit(labels=[rf.REVERT_LABEL])
        self.assertEqual(rf.decide(self.named(labeled))["reason"], "culprit-is-a-revert")

    def test_a_culprit_already_reverted_on_main_is_not_reverted_again(self):
        # Seer review on #25020: the revert merged, Main Health is still red, and the oldest red push of the
        # streak still names the same commit. Reverting it again does nothing; a human bisects the rest.
        reverted = {**commit(), "revertedBy": "c" * 40}
        self.assertEqual(rf.decide(self.named(reverted)),
                         {"action": "alert", "reason": "culprit-already-reverted-needs-bisect"})

    def test_revert_re_land_revert_then_a_human(self):
        relanded = {**commit(subject="fix(main-red): re-land new tier copy (#24120)"), "priorAttempts": 2}
        self.assertEqual(rf.decide(self.named(relanded)), {"action": "alert", "reason": "attempt-cap"})
        once = {**commit(), "priorAttempts": 1}
        self.assertEqual(rf.decide(self.named(once))["action"], "open-revert")
        plan = rf.revert_plan(self.named(once), named_at=NAMED_AT)
        self.assertEqual(rf.read_marker(plan["body"])["attempt"], 2)

    def test_a_culprit_without_a_pr_cannot_be_re_landed(self):
        self.assertEqual(rf.decide(self.named(commit(subject="feat: direct push")))["reason"], "culprit-has-no-pr")

    def test_an_open_forward_fix_is_not_an_input(self):
        # A forward fix replaces the revert only by landing first, so decide() takes no repair list at all.
        with self.assertRaises(TypeError):
            rf.decide(self.named(), repairs=[{"number": 25011}])


class RevertPlanTest(unittest.TestCase):
    def plan(self, culprit=None):
        return rf.revert_plan(rf.name_culprit(RED_AFTER_GREEN, [culprit or commit()]), named_at=NAMED_AT)

    def test_plan_shares_the_main_red_eject_contract(self):
        plan = self.plan()
        self.assertEqual(plan["branch"], f"compounding/revert-24100-{RED[:7]}")
        self.assertEqual(plan["labels"], ["compounding", "main-red-revert"])
        self.assertEqual(plan["title"], "revert(main-red): new tier copy (#24100)")
        marker = rf.read_marker(plan["body"])
        self.assertEqual(marker, {"attempt": 1, "check": rf.CHECK, "culprit": RED, "namedAt": int(NAMED_AT),
                                  "origin": 24100, "source": "main-health"})
        self.assertIn("https://github.com/JovieInc/Jovie/actions/runs/3", plan["body"])
        self.assertIn(f"Reverts {RED}.", plan["commitMessage"])
        self.assertEqual(plan["deadline"] - plan["namedAt"], 15 * 60)
        # A `compounding` PR owes a Win section or Fleet Rules fails it (scripts/lib/wins-ledger.mjs requiresWin).
        self.assertIn("## Win\n\n- Claim:", plan["body"])
        self.assertIn("- Area: queue\n", plan["body"])
        self.assertIn("- Verify: https://github.com/JovieInc/Jovie/actions/runs/3\n- Pending: yes", plan["body"])

    def test_dependency_bump_plan_says_so(self):
        plan = self.plan(VERCEL_BUMP)
        self.assertTrue(plan["dependencyBump"])
        self.assertIn("Dependency bumps are always reverted", plan["body"])

    def test_invalid_win_evidence_cannot_leave_the_generator(self):
        attribution = rf.name_culprit(RED_AFTER_GREEN, [commit()])
        attribution["run"] = "\n## Unexpected section\n"
        with self.assertRaisesRegex(ValueError, "only Win evidence"):
            rf.revert_plan(attribution, named_at=NAMED_AT)

    def test_titles_stay_conventional_and_within_100_characters(self):
        plan = self.plan(commit(subject=f"feat(web): {'x' * 200} (#24100)"))
        self.assertLessEqual(len(plan["title"]), 100)
        self.assertTrue(plan["title"].startswith("revert(main-red): ") and plan["title"].endswith(" (#24100)"))

    def test_read_marker_rejects_garbage(self):
        self.assertIsNone(rf.read_marker("no marker"))
        self.assertIsNone(rf.read_marker("<!-- main-red-eject {nope} -->"))


class SupersededAndSlaTest(unittest.TestCase):
    def test_a_forward_fix_that_landed_first_supersedes_the_revert(self):
        marker = rf.read_marker(rf.revert_plan(rf.name_culprit(RED_AFTER_GREEN, [commit()]), named_at=NAMED_AT)["body"])
        green = rf.name_culprit([run(OTHER, "success"), *RED_AFTER_GREEN], None)
        self.assertTrue(rf.superseded(marker, green))
        self.assertFalse(rf.superseded(marker, rf.name_culprit(RED_AFTER_GREEN, [commit()])))
        # Merge-group ejector reverts carry no Main Health source; Main Health going green says nothing about them.
        self.assertFalse(rf.superseded({"check": "test:x", "culprit": RED}, green))
        self.assertFalse(rf.superseded(None, green))

    def test_sla_is_fifteen_minutes_from_the_culprit_being_named(self):
        self.assertEqual(rf.sla(NAMED_AT, NAMED_AT + 600, NAMED_AT + 9999),
                         {"withinSla": True, "lateS": 0, "opened": True})
        self.assertEqual(rf.sla(NAMED_AT, NAMED_AT + 960, NAMED_AT + 960)["lateS"], 60)
        self.assertEqual(rf.sla(NAMED_AT, None, NAMED_AT + 1000),
                         {"withinSla": False, "lateS": 100, "opened": False})


class RemediationRungTest(unittest.TestCase):
    HEAD = "7cf5b07"

    def test_main_red_with_a_named_culprit_is_reverted_not_waited_on(self):
        event = {"source": "main-ci", "main_red": True, "culprit": VERCEL_BUMP, "evidence": {"excerpt": "census red"}}
        classified = remediation.classify_event(event)
        self.assertEqual((classified["cls"], classified["subtype"], classified["next_action"]),
                         ("main-red", "culprit-named", "revert"))
        self.assertIn(f"culprit {RED[:12]} (dependency bump)", classified["evidence"])
        ladder = remediation.plan_ladder(classified, {}, {}, NAMED_AT, self.HEAD)
        self.assertEqual(ladder, {"action": "revert", "reason": "culprit-named", "kind": "deterministic",
                                  "cls": "main-red"})

    def test_main_red_without_a_culprit_still_waits(self):
        classified = remediation.classify_event({"source": "main-ci", "main_red": True, "evidence": {}})
        self.assertEqual((classified["subtype"], classified["next_action"]), ("main-red", "wait"))
        self.assertEqual(remediation.plan_ladder(classified, {}, {}, NAMED_AT, self.HEAD)["action"], "wait")
        bare = remediation.classify_event({"source": "main-ci", "main_red": True, "culprit": {"subject": "no sha"}, "evidence": {}})
        self.assertEqual(bare["next_action"], "wait")

    def test_a_victim_pr_on_a_red_main_still_waits(self):
        # The PR is not the culprit; main's revert is what frees it.
        ladder = remediation.plan_ladder({"cls": "flaky-infra", "subtype": "main-red"}, {}, {}, NAMED_AT, self.HEAD)
        self.assertEqual(ladder, {"action": "wait", "reason": "main-red", "cls": "main-red"})


if __name__ == "__main__":
    unittest.main()
