"""Lane PR bodies satisfy the real scripts/pr-fleet-rules.mjs policy, and a missing fact
becomes a lane action rather than an invented value.

Run with: python3 -m pytest scripts/tests/test_pr_body.py -v
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import pr_body  # noqa: E402

NODE = shutil.which("node")
DRIVER = (
    "import {evaluateFleetRules} from %s;"
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const i=JSON.parse(s);"
    "console.log(JSON.stringify(evaluateFleetRules(i)))});"
) % json.dumps((ROOT / "scripts/pr-fleet-rules.mjs").as_uri())
RUN = "https://github.com/JovieInc/Jovie/actions/runs/123456789"
RED = pr_body.RedEvidence("pnpm --filter @jovie/web exec vitest run tests/unit/x.test.ts",
                          "FAIL tests/unit/x.test.ts\nAssertionError: expected 1 to be 2")


def evaluate(title, body, files, labels=()):
    assert NODE, "node is required for the real fleet-rules evaluation"
    entries = [{"filename": f, "status": "modified", "patch": "+  expect(a).toBe(1);\n"} for f in files]
    done = subprocess.run([NODE, "--input-type=module", "-e", DRIVER], capture_output=True, text=True, timeout=60,
                          input=json.dumps({"pr": {"title": title, "body": body, "labels": list(labels)},
                                            "files": entries}))
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


class BuildBody(unittest.TestCase):
    def check(self, built, title, files, labels=()):
        result = evaluate(title, built.body, files, labels)
        self.assertEqual(result["errors"], [], built.body)
        self.assertEqual(result["warnings"], [], built.body)

    def test_issue_pr_with_captured_red_passes(self):
        files = ["apps/web/lib/x.ts", "apps/web/tests/unit/x.test.ts"]
        built = pr_body.build_body(title="fix: thing (JOV-1)", identifier="JOV-1", issue_id="abc", files=files, red=RED)
        self.assertEqual(built.actions, [])
        self.check(built, "fix: thing (JOV-1)", files)
        self.assertIn("Refs JOV-1.", built.body)
        self.assertIn("Regression test: `apps/web/tests/unit/x.test.ts`", built.body)

    def test_red_from_failing_run_url_only_passes(self):
        files = ["apps/web/lib/x.ts", "apps/web/tests/unit/x.test.ts"]
        built = pr_body.build_body(title="fix: y", files=files, red=pr_body.RedEvidence("CI job \"lint\"", "", RUN))
        self.check(built, "fix: y", files)

    def test_locked_area_with_citation_passes(self):
        files = ["apps/web/app/(auth)/x.ts", "apps/web/tests/unit/a.test.ts"]
        built = pr_body.build_body(title="fix: z", files=files, red=RED, locked_citation="GBrain: auth-locking-decision")
        self.check(built, "fix: z", files)

    def test_non_repair_pr_passes_without_red(self):
        files = ["apps/web/lib/x.ts"]
        built = pr_body.build_body(title="feat: new", files=files)
        self.assertEqual(built.actions, [])
        self.check(built, "feat: new", files)

    def test_exempt_ios_pr_needs_no_red(self):
        files = ["apps/ios/App/View.swift"]
        built = pr_body.build_body(title="fix: ios", files=files)
        self.assertEqual(built.actions, [])
        self.check(built, "fix: ios", files)

    def test_locked_path_parity_with_policy(self):
        for path in ["apps/web/app/(auth)/x.ts", "a/design-system.css", "x/clerk-client.ts", "a/b/ratchet-baseline.json",
                     "apps/web/data/homepageV2Copy.ts", "apps/web/lib/plain.ts", "apps/web/components/homepage/Other.tsx"]:
            result = evaluate("feat: t", "## Summary\n\nx", [path])
            self.assertEqual(pr_body.is_locked_area(path), any(e.startswith("locked-areas") for e in result["errors"]), path)

    def test_missing_facts_are_actions_not_values(self):
        files = ["apps/web/app/(auth)/x.ts"]
        built = pr_body.build_body(title="fix: no facts", files=files)
        self.assertEqual(built.actions, [pr_body.NEED_TEST, pr_body.NEED_RED, pr_body.NEED_LOCK])
        for needle in ("Red-before-green", "Failing command", "GBrain", "Locking PR", "Regression test"):
            self.assertNotIn(needle, built.body)
        # And the real policy agrees those facts are still missing (nothing was faked).
        errors = evaluate("fix: no facts", built.body, files)["errors"]
        self.assertTrue(any(e.startswith("red-before-green") for e in errors))
        self.assertTrue(any(e.startswith("locked-areas") for e in errors))

    def test_unusable_red_is_not_used(self):
        for red in (pr_body.RedEvidence("cmd", "all fine, ok"), pr_body.RedEvidence("", "FAIL x"),
                    pr_body.RedEvidence("cmd", "", "https://example.com/runs/1")):
            built = pr_body.build_body(title="fix: q", files=["a.ts", "a.test.ts"], red=red)
            self.assertIn(pr_body.NEED_RED, built.actions)


class RefreshBody(unittest.TestCase):
    FILES = ["apps/web/lib/x.ts", "apps/web/tests/unit/x.test.ts"]

    def test_agent_body_without_sections_gets_them_from_the_failing_run(self):
        pr = {"statusCheckRollup": [{"name": "unit", "conclusion": "FAILURE", "detailsUrl": RUN + "/job/9"}]}
        red = pr_body.failing_run_evidence(pr, "JovieInc/Jovie")
        self.assertEqual(red.run_url, RUN)
        built = pr_body.refresh_body("Refs JOV-1.\n\nAgent wrote this.", title="fix: x", files=self.FILES, red=red)
        self.assertEqual(built.actions, [])
        self.assertIn("Agent wrote this.", built.body)
        result = evaluate("fix: x", built.body, self.FILES)
        self.assertEqual((result["errors"], result["warnings"]), ([], []), built.body)

    def test_refresh_is_idempotent_and_keeps_agent_filled_sections(self):
        agent = ("## Red-before-green\n\nFailing command: `pnpm vitest run a`\nFailing run (before fix): " + RUN +
                 "\n\n## Blast radius\n\nWhat could break: billing page\nProof: ran vitest, green\n")
        once = pr_body.refresh_body(agent, title="fix: x", files=self.FILES, red=RED)
        twice = pr_body.refresh_body(once.body, title="fix: x", files=self.FILES, red=RED)
        self.assertEqual(once.body, twice.body)
        self.assertIn("Failing command: `pnpm vitest run a`", once.body)
        self.assertIn("What could break: billing page", once.body)
        self.assertNotIn(RED.command, once.body.split("## Red-before-green")[1].split("##")[0])

    def test_no_failing_run_is_an_action(self):
        self.assertIsNone(pr_body.failing_run_evidence({"statusCheckRollup": [
            {"name": "a", "conclusion": "SUCCESS", "detailsUrl": RUN},
            {"name": "b", "conclusion": "FAILURE", "detailsUrl": "https://github.com/Other/Repo/actions/runs/5"}]},
            "JovieInc/Jovie"))
        built = pr_body.refresh_body("Refs JOV-1.", title="fix: x", files=self.FILES, red=None)
        self.assertEqual(built.actions, [pr_body.NEED_RED])
        self.assertNotIn("Failing command", built.body)


class CaptureRed(unittest.TestCase):
    def runner(self, base_rc, out, log):
        def run(args, cwd=None, timeout=0):
            log.append(args)
            rc = base_rc if args[0] in ("pnpm", "python3", "node") else 0
            return SimpleNamespace(returncode=rc, stdout=out, stderr="")
        return run

    def setUp(self):
        import tempfile
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "tests").mkdir()
        (self.tmp / "tests/test_a.py").write_text("def test_a(): assert False\n")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_captures_real_failure(self):
        log = []
        red, why = pr_body.capture_red(self.runner(1, "FAILED test_a - AssertionError", log), self.tmp, "origin/main",
                                       ["tests/test_a.py"])
        self.assertEqual(why, "captured")
        self.assertTrue(red.usable() and red.command.startswith("python3 -m pytest"))

    def test_test_passing_on_base_yields_no_evidence(self):
        red, why = pr_body.capture_red(self.runner(0, "1 passed", []), self.tmp, "origin/main", ["tests/test_a.py"])
        self.assertIsNone(red)
        self.assertEqual(why, "changed-tests-pass-on-base")

    def test_nonred_failure_is_not_evidence(self):
        red, why = pr_body.capture_red(self.runner(1, "command not found", []), self.tmp, "origin/main", ["tests/test_a.py"])
        self.assertIsNone(red)

    def test_no_runnable_test(self):
        self.assertEqual(pr_body.capture_red(lambda *a, **k: None, self.tmp, "origin/main", ["README.md"]),
                         (None, "no-runnable-changed-test"))


if __name__ == "__main__":
    unittest.main()
