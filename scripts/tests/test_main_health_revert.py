"""Main Health revert opener (revert first). Hermetic: fake gh, git and clock; no network, no repository writes."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import main_health_revert as mhr  # noqa: E402
import revert_first as rf  # noqa: E402

GREEN, RED = "a" * 40, "b" * 40
NOW = 1_794_391_740.0  # 2026-11-11T10:09:00Z
SUBJECT = "feat(pricing): new tier copy (#24100)"


def run(sha, conclusion, event="push", rid=1, at="2026-11-11T10:00:00Z"):
    return {"head_sha": sha, "conclusion": conclusion, "event": event, "created_at": at, "updated_at": at,
            "html_url": f"https://github.com/JovieInc/Jovie/actions/runs/{rid}"}


RED_RUNS = [run(RED, "failure", rid=3, at="2026-11-11T10:05:00Z"), run(GREEN, "success", rid=2)]


class Fake:
    def __init__(self, runs, *, log=f"{RED}\x1fitstimwhite\x1f{SUBJECT}", reverts=(), culprit_pr=None,
                 conflict=False, reverted_log="", existing_pr=()):
        self.runs, self.log, self.reverts, self.conflict = runs, log, list(reverts), conflict
        self.reverted_log, self.existing_pr = reverted_log, list(existing_pr)
        self.culprit_pr = culprit_pr or {"labels": [], "body": ""}
        self.gh_calls, self.git_calls = [], []

    def gh(self, args, priority="repair"):
        self.gh_calls.append((args, priority))
        path = args[-1] if args[:1] == ["api"] and len(args) == 2 else None
        if path and "main-health.yml/runs" in path:
            return json.dumps({"workflow_runs": self.runs})
        if path and "labels=main-red-revert" in path:
            return json.dumps(self.reverts)
        if path and "pulls?head=" in path:
            return json.dumps(self.existing_pr)
        if path and path.startswith("repos/JovieInc/Jovie/issues/"):
            return json.dumps(self.culprit_pr)
        if args[:4] == ["api", "-X", "POST", "repos/JovieInc/Jovie/pulls"]:
            return json.dumps({"number": 25050, "created_at": "2026-11-11T10:09:00Z"})
        return "{}"

    def git(self, *args):
        self.git_calls.append(args)
        if args[0] == "log":
            return self.reverted_log if any(str(a).startswith("--grep=") for a in args) else self.log
        if args[:2] == ("revert", "--no-edit") and self.conflict:
            raise subprocess.CalledProcessError(1, "git revert")
        return ""

    def io(self):
        return mhr.Io(gh=self.gh, git=self.git, now=lambda: NOW)

    def writes(self):
        return [a for a, _ in self.gh_calls if a[:2] == ["api", "-X"] or a[:1] == ["workflow"]]


def revert_issue(number, **marker):
    return {"number": number, "pull_request": {"url": "pulls"}, "body": f"<!-- main-red-eject {json.dumps(marker)} -->"}


def main(fake, command="apply", mode="apply"):
    with mock.patch.dict(os.environ, {"MAIN_RED_EJECT_MODE": mode}):
        return mhr.main([command], fake.io())


class OpenRevertTest(unittest.TestCase):
    def test_named_culprit_gets_a_jumping_revert_pr_within_the_sla(self):
        fake = Fake(RED_RUNS)
        result = main(fake)
        self.assertEqual(result["decision"], {"action": "open-revert", "reason": "culprit-named"})
        self.assertEqual(fake.git_calls[0], ("log", "--reverse", "--format=%H%x1f%an%x1f%s", f"{GREEN}..{RED}"))
        branch = f"compounding/revert-24100-{RED[:7]}"
        self.assertIn(("switch", "-C", branch, "origin/main"), fake.git_calls)
        self.assertIn(("revert", "--no-edit", RED), fake.git_calls)
        self.assertIn(("push", "--force-with-lease", "origin", branch), fake.git_calls)
        writes = fake.writes()
        self.assertEqual(writes[0][:4], ["api", "-X", "POST", "repos/JovieInc/Jovie/pulls"])
        self.assertIn("title=revert(main-red): new tier copy (#24100)", writes[0])
        self.assertEqual(writes[1], ["api", "-X", "POST", "repos/JovieInc/Jovie/issues/25050/labels",
                                     "-f", "labels[]=compounding", "-f", "labels[]=main-red-revert"])
        self.assertEqual(writes[2], ["workflow", "run", "merge-queue-green-enroll.yml", "-f", "pr_number=25050"])
        # Named when the red run finished (10:05Z), opened 10:09Z: inside 15 minutes.
        self.assertEqual(result["revert"]["sla"], {"withinSla": True, "lateS": 0, "opened": True})

    def test_a_dependency_bump_is_reverted(self):
        fake = Fake(RED_RUNS, log=f"{RED}\x1fdependabot[bot]\x1fbuild(deps-dev): bump vercel from 56.0.0 to 59.0.0 (#21876)")
        result = main(fake)
        self.assertEqual(result["decision"]["reason"], "dependency-bump")
        self.assertTrue(result["revert"]["plan"]["dependencyBump"])

    def test_a_revert_that_conflicts_opens_nothing(self):
        fake = Fake(RED_RUNS, conflict=True)
        result = main(fake)
        self.assertEqual(result["revert"]["reason"], "revert-conflict")
        self.assertIn(("revert", "--abort"), fake.git_calls)
        self.assertEqual(fake.writes(), [])

    def test_one_revert_per_culprit_including_the_merge_group_ejector(self):
        fake = Fake(RED_RUNS, reverts=[revert_issue(25001, check="test:x", culprit=RED, origin=24100, attempt=1)])
        result = main(fake)
        self.assertEqual(result["decision"]["reason"], "revert-in-flight")
        self.assertEqual(fake.writes(), [])

    def test_a_re_land_that_breaks_main_again_goes_to_a_human(self):
        fake = Fake(RED_RUNS, culprit_pr={"labels": [{"name": "main-red-reopen"}],
                                          "body": '<!-- main-red-eject {"attempt": 2, "origin": 24000} -->'})
        self.assertEqual(main(fake)["decision"], {"action": "alert", "reason": "attempt-cap"})
        self.assertEqual(fake.writes(), [])

    def test_a_culprit_whose_revert_already_merged_is_not_reverted_again(self):
        # Seer review on #25020: still red after the revert merged; the streak's first red push is unchanged.
        fake = Fake(RED_RUNS, reverted_log=f"{'c' * 40}\x1frevert(main-red): new tier copy (#24100) (#25050)")
        result = main(fake)
        self.assertEqual(result["decision"], {"action": "alert", "reason": "culprit-already-reverted-needs-bisect"})
        self.assertIn(("log", "--format=%H%x1f%s", "-F", f"--grep={RED}", "--grep=(#24100)", f"{RED}..origin/main"),
                      fake.git_calls)
        self.assertEqual(fake.writes(), [])

    def test_a_mention_that_is_not_a_revert_does_not_count(self):
        fake = Fake(RED_RUNS, reverted_log=f"{'c' * 40}\x1fdocs: note on new tier copy (#24100) (#25060)")
        self.assertEqual(main(fake)["decision"]["action"], "open-revert")

    def test_a_revert_pr_left_unlabelled_is_reused_not_reopened(self):
        # Seer review on #25020: the PR was created but the label call failed, so open_reverts (label filter) misses
        # it; the next wake must label the open PR on that head branch instead of a POST that 422s.
        fake = Fake(RED_RUNS, existing_pr=[{"number": 25050, "created_at": "2026-11-11T10:09:00Z"}])
        result = main(fake)
        writes = fake.writes()
        self.assertFalse(any(w[:4] == ["api", "-X", "POST", "repos/JovieInc/Jovie/pulls"] for w in writes))
        self.assertEqual(writes[0][:4], ["api", "-X", "POST", "repos/JovieInc/Jovie/issues/25050/labels"])
        self.assertEqual(writes[1], ["workflow", "run", "merge-queue-green-enroll.yml", "-f", "pr_number=25050"])
        self.assertEqual(result["revert"]["pr"], 25050)


class NoMutationTest(unittest.TestCase):
    def test_plan_and_dry_mode_never_write(self):
        for command, mode in (("plan", "apply"), ("apply", "dry"), ("apply", "off")):
            with self.subTest(command=command, mode=mode):
                fake = Fake(RED_RUNS)
                main(fake, command, mode)
                self.assertEqual(fake.writes(), [])
                self.assertEqual({c[0] for c in fake.git_calls}, {"log"})

    def test_a_time_bomb_on_an_unchanged_commit_reverts_nothing(self):
        fake = Fake([run(GREEN, "failure", event="workflow_dispatch", rid=4), run(GREEN, "success")])
        result = main(fake)
        self.assertEqual(result["decision"], {"action": "none", "reason": "red-on-an-unchanged-commit"})
        self.assertEqual((fake.writes(), fake.git_calls), ([], []))

    def test_an_unreadable_range_reverts_nothing(self):
        fake = Fake(RED_RUNS)
        fake.git = lambda *a: (_ for _ in ()).throw(subprocess.CalledProcessError(128, "git log"))
        self.assertEqual(main(fake)["decision"]["action"], "none")


class SupersededTest(unittest.TestCase):
    def test_green_main_closes_only_main_health_reverts(self):
        reverts = [revert_issue(25050, check=rf.CHECK, culprit=RED, origin=24100, attempt=1, source="main-health"),
                   revert_issue(25001, check="test:x", culprit=GREEN, origin=24000, attempt=1)]
        fake = Fake([run("c" * 40, "success", rid=5), *RED_RUNS], reverts=reverts)
        result = main(fake)
        self.assertEqual(result["closed"], [25050])
        writes = fake.writes()
        self.assertEqual(writes[0][:4], ["api", "-X", "POST", "repos/JovieInc/Jovie/issues/25050/comments"])
        self.assertEqual(writes[1], ["api", "-X", "PATCH", "repos/JovieInc/Jovie/pulls/25050", "-f", "state=closed"])
        self.assertEqual(len(writes), 2)


class GhFailoverTest(unittest.TestCase):
    def test_exhausted_installation_retries_on_the_job_token(self):
        calls = []

        def fake_run(args, priority="default", env=None):
            calls.append((priority, (env or {}).get("GH_TOKEN")))
            if len(calls) == 1:
                return {"code": 75, "stdout": "", "stderr": "shed", "deferred": True}
            return {"code": 0, "stdout": "{}", "stderr": "", "deferred": False}
        with mock.patch.dict(os.environ, {"GH_FALLBACK_TOKEN": "fallback-placeholder"}):
            self.assertEqual(mhr._gh(["api", "x"], "poll", run=fake_run), "{}")
        self.assertEqual(calls, [("poll", None), ("poll", "fallback-placeholder")])

    def test_other_failures_raise(self):
        def fake_run(args, priority="default", env=None):
            return {"code": 1, "stdout": "", "stderr": "HTTP 422", "deferred": False}
        with mock.patch.dict(os.environ, {"GH_FALLBACK_TOKEN": "fallback-placeholder"}), self.assertRaises(RuntimeError):
            mhr._gh(["api", "x"], run=fake_run)


if __name__ == "__main__":
    unittest.main()
