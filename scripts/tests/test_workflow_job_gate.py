"""Workflow kill-switch wins count ungated jobs. Synthetic YAML only; no git history."""
from __future__ import annotations

import base64
import json
from pathlib import Path
import subprocess
import sys
import unittest
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lanes"))
import fix_red_classes as classes
import fix_red_measured_win
import repair_win

OLD, NEW = "a" * 40, "b" * 40
PATH = ".github/workflows/demo.yml"
PHRASE = "needs a measured win (metric, before, after, method, evidence)"


def pr(*names):
    return {"mergeStateStatus": "BLOCKED", "statusCheckRollup": [
        {"name": name, "conclusion": "FAILURE"} for name in names]
        + [{"name": "PR Ready", "conclusion": "FAILURE"}, {"name": "ok", "conclusion": "SUCCESS"}]}


def job(condition):
    lines = ["name: demo", "jobs:", "  sync_done:"]
    if condition is not None:
        lines.append(f"    if: {condition}")
    lines += ["    runs-on: ubuntu-latest", "    steps:", "      - run: echo gated"]
    return "\n".join(lines) + "\n"


BEFORE = job("github.event_name != 'pull_request' || github.event.pull_request.merged == true")
AFTER = job(">-\n      vars.FEATURE_GATE == 'true' &&\n"
            "      (github.event_name != 'pull_request' || github.event.pull_request.merged == true)")


def contents(text):
    return SimpleNamespace(returncode=0, stdout=json.dumps({
        "encoding": "base64", "content": base64.b64encode(text.encode()).decode()}))


class WorkflowJobGateTest(unittest.TestCase):
    def measure(self, before=BEFORE, after=AFTER, *, before_sha=OLD, after_sha=NEW, path=PATH):
        return repair_win.workflow_job_gate(
            before, after, before_sha=before_sha, after_sha=after_sha, path=path)

    def test_counts_jobs_that_do_not_require_the_new_variable(self):
        win = self.measure()
        self.assertIn("| jobs | lower | 1 | 0 |", win)
        self.assertIn("FEATURE_GATE ungated jobs", win)
        self.assertIn(f"workflow-job-gate {OLD} {NEW} {PATH}", win)
        self.assertNotIn("Pending", win)
        self.assertNotIn("Per-merge", win)
        bare = job(None)
        gated = job("vars.FEATURE_GATE == 'true'")
        self.assertIn("| jobs | lower | 1 | 0 |", self.measure(bare, gated))
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const win = readFileSync(0, 'utf8');
const title = 'ci: gate Linear Sync on Merge off (JOV-13076)';
console.log(JSON.stringify(evaluateFleetRules({
  pr: {title, body: win, labels: []}, files: [],
}).errors));
"""], cwd=ROOT, input=win, text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(checked.stdout), [])

    def test_rejects_anything_except_one_new_variable_gate(self):
        moved = AFTER.replace("ubuntu-latest", "ubuntu-22.04")
        cases = (
            (BEFORE, moved, "only job if"),
            (BEFORE, BEFORE, "exactly one new variable"),
            (BEFORE, job("always()"), "conjunction"),
            (BEFORE, job("vars.FEATURE_GATE == 'true' && other"), "preserve"),
            (job("note vars.FEATURE_GATE == 'true'"),
             job("vars.FEATURE_GATE == 'true' && note vars.FEATURE_GATE == 'true'"), "fewer ungated"),
            (BEFORE, job("true"), "must be a string"),
            ("name: demo\njobs: {}\n", "name: demo\njobs: {}\n", "jobs map"),
            (BEFORE, AFTER, "exact Git revisions"),
            (BEFORE, AFTER, "one workflow path"),
        )
        for before, after, message in cases:
            kwargs = {}
            if message == "exact Git revisions":
                kwargs["before_sha"] = "abc"
            if message == "one workflow path":
                kwargs["path"] = "README.md"
            with self.subTest(message=message):
                with self.assertRaisesRegex(ValueError, message):
                    self.measure(before, after, **kwargs)

    def test_one_workflow_beside_the_repair_machine_is_measurable(self):
        workflow = {"filename": PATH, "status": "modified"}
        machine = {"filename": "scripts/lanes/repair_win.py", "status": "modified"}
        added = {"filename": "scripts/tests/test_workflow_job_gate.py", "status": "added"}
        self.assertEqual(repair_win.workflow_gate_path([machine, workflow, added]), PATH)
        for files in (
            [workflow, {"filename": "README.md", "status": "modified"}],
            [{**workflow, "status": "added"}],
            [workflow, workflow],
        ):
            with self.subTest(files=files), self.assertRaisesRegex(ValueError, "not a pin bump"):
                repair_win.workflow_gate_path(files)


def sole_log():
    return "\n".join([
        "2026-11-19T19:19:58.7312064Z ##[warning]blast-radius: describe what could break",
        "2026-11-19T19:19:58.7316766Z ##[error]win: this PR is compounding work and "
        f"{PHRASE}.",
        "##[notice]Fleet policy remains red",
        "2026-11-19T19:19:58.7387988Z ##[error]Process completed with exit code 1.",
    ])


class SoleMeasuredWinRouteTest(unittest.TestCase):
    def route(self, logs):
        return classes.classify(pr(*logs), logs)

    def test_every_failing_check_must_be_that_win_alone(self):
        names = ("Fleet Rules Evidence", "PR Fleet Rules")
        promoted = self.route({name: sole_log() for name in names})
        self.assertEqual((promoted["cls"], promoted["action"]), ("measured-win", "repair-win"))
        short = "##[error]win: this PR needs a measured win"
        stayed = self.route({name: short for name in names})
        self.assertEqual((stayed["cls"], stayed["action"]), ("fleet-body", "agent"))
        both = "##[error]red-before-green: missing\n" + sole_log()
        mixed_log = self.route({name: both for name in names})
        self.assertEqual((mixed_log["cls"], mixed_log["action"]), ("fleet-body", "agent"))
        split = self.route({
            "Fleet Rules Evidence": sole_log(),
            "Source Validation": "Unwired: scripts/a.test.mjs. Wire each file into a ci-fast lane",
        })
        self.assertEqual((split["cls"], split["action"]), ("mixed", "agent"))
        self.assertEqual(split["repairs"], [])


class WorkflowSectionPublishTest(unittest.TestCase):
    def shell(self, body, *, contents_code=0):
        def sh(args):
            target = args[-1]
            if "--slurp" in args:
                return SimpleNamespace(returncode=0, stdout=json.dumps([[
                    {"filename": PATH, "status": "modified"},
                    {"filename": "scripts/lanes/repair_win.py", "status": "modified"},
                ]]))
            if target.endswith("/pulls/26016"):
                return SimpleNamespace(returncode=0, stdout=json.dumps(
                    {"base": {"sha": OLD}, "head": {"sha": NEW}}))
            if f"ref={OLD}" in target:
                return contents(BEFORE) if contents_code == 0 else SimpleNamespace(returncode=1, stdout="")
            if f"ref={NEW}" in target:
                return contents(AFTER) if contents_code == 0 else SimpleNamespace(returncode=1, stdout="")
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout=body[0])
            if args[:2] == ["pr", "edit"]:
                body[0] = Path(args[args.index("--body-file") + 1]).read_text()
                return SimpleNamespace(returncode=0, stdout="")
            return SimpleNamespace(returncode=1, stdout="")
        return sh

    def test_section_for_reads_both_revisions_and_apply_claims_once(self):
        body = ["Summary\n"]
        sh = self.shell(body)
        section = fix_red_measured_win.section_for([
            {"filename": PATH, "status": "modified"},
            {"filename": "scripts/tests/test_workflow_job_gate.py", "status": "added"},
        ], sh, {"number": 26016})
        self.assertIn("| jobs | lower | 1 | 0 |", section)
        claimed = []
        reason = fix_red_measured_win.apply(
            None, {"number": 26016}, lambda *args: claimed.append(args) or True, sh=sh)
        self.assertEqual(reason, "infra-rerun:measured-win")
        self.assertEqual(claimed, [(None, {"number": 26016}, "repair-win")])
        self.assertIn("## Win", body[0])
        self.assertEqual(body[0].count("customer-changelog/v1"), 1)
        refused_edits = []
        original = sh

        def tracking(args):
            if args[:2] == ["pr", "edit"]:
                refused_edits.append(args)
            return original(args)

        self.assertIsNone(fix_red_measured_win.apply(
            None, {"number": 26016}, lambda *args: False, sh=tracking))
        self.assertEqual(refused_edits, [])

    def test_a_failed_contents_read_does_not_claim(self):
        claimed = []
        reason = fix_red_measured_win.apply(
            None, {"number": 26016}, lambda *args: claimed.append(args) or True,
            sh=self.shell(["Summary\n"], contents_code=1))
        self.assertIsNone(reason)
        self.assertEqual(claimed, [])


if __name__ == "__main__":
    unittest.main()
