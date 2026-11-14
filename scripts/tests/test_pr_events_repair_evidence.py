"""Repair-evidence regression tests for scripts/lanes/pr_events.py (JOV-6672).

Split from test_pr_events.py (size-500). Run with:
    python3 -m pytest scripts/tests/test_pr_events_repair_evidence.py -v
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

os.environ["LANES_EXECUTION_BACKEND"] = "local-test"
ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Share test_pr_events.py's module when it already loaded it in this run.
events = sys.modules.get("pr_events") or load("pr_events")


class Shell:
    """Canned `gh` (same as test_pr_events.py): routes by argv prefix, records every call."""
    def __init__(self, routes=None):
        self.routes, self.calls = routes or {}, []

    def __call__(self, args, cwd=None, timeout=600, env=None, log=None, stream=False):
        self.calls.append(args)
        for prefix, reply in self.routes.items():
            if tuple(args[:len(prefix)]) == prefix:
                reply = reply(args) if callable(reply) else reply
                code, out = reply if isinstance(reply, tuple) else (0, reply)
                return SimpleNamespace(returncode=code, stdout=out if isinstance(out, str) else json.dumps(out), stderr="")
        if len(args) > 1 and Path(args[1]).name == "source_admission.mjs":
            out = {"schema": "jovie-source-admission/v1", "allowed": True, "blockers": [],
                   "prNumber": int(args[-2]), "headSha": args[-1]}
        elif "check-reenroll" in args:
            out = {"number": int(args[-1]), "reenrollable": True}
        else:
            out = None
        return SimpleNamespace(returncode=0, stdout=json.dumps(out) if out else "", stderr="")

    def made(self, *prefix):
        return [call for call in self.calls if tuple(call[:len(prefix)]) == prefix]


from .repair_customer_decision_cases import CustomerDecisionCases


class RedBeforeGreenEvidenceTests(CustomerDecisionCases, unittest.TestCase):
    PR = {"number": 7, "headRefOid": "a" * 40, "statusCheckRollup": [
        {"name": "Source Validation", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/JovieInc/Jovie/actions/runs/123/job/456"}]}

    WIN = ("## Win\n\n- Claim: Complete measured repair evidence.\n- Area: quality\n"
           "- Theme: repair-evidence\n"
           "- Metric: missing evidence fields | count | lower | 1 | 0 | Fleet policy | node --test\n"
           "- Verify: https://github.com/JovieInc/Jovie/actions/runs/123\n")

    PREMISE = {
        "Assumption": "The new hold block adds the third direct profile write.",
        "Falsifying test": "node /tmp/compare-profile-writes.mjs",
        "Result": "Main: 2; head: 3; head without hold block: 2.",
    }

    def test_repair_refuses_ambiguous_customer_decisions_before_publication(self):
        decision = '<!-- customer-changelog/v1 {"releaseWorthy":false} -->'
        for duplicate in [decision, '<!-- customer-changelog/v1 {"releaseWorthy":true} -->']:
            with self.assertRaisesRegex(ValueError, "exactly one customer changelog decision"):
                events.repair_evidence_body(self.PR, decision + "\n" + duplicate,
                                            customer_decision={"releaseWorthy": False})

    def test_explicit_premise_repairs_body_and_passes_canonical_policy(self):
        body = events.red_before_green_block(self.PR)
        updated = events.repair_evidence_body(self.PR, body, premise=self.PREMISE)
        self.assertIn(body, updated)
        self.assertEqual(updated.count("## Premise check"), 1)
        self.assertEqual(events.repair_evidence_body(self.PR, updated, premise=self.PREMISE), updated)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { hasPremiseEvidence } from './scripts/pr-fleet-rules.mjs';
console.log(hasPremiseEvidence(readFileSync(0, 'utf8')));
"""], cwd=ROOT, input=updated, text=True, capture_output=True, check=True)
        self.assertEqual(checked.stdout.strip(), "true")

    def test_premise_is_explicit_preserves_existing_and_rejects_invalid_fields(self):
        body = events.red_before_green_block(self.PR)
        self.assertNotIn("## Premise check", events.repair_evidence_body(self.PR, body))
        original = body + "\n## Premise check\n\nOriginal observation\n"
        self.assertEqual(events.repair_evidence_body(self.PR, original, premise=self.PREMISE), original)
        for invalid in ({}, {**self.PREMISE, "Result": ""},
                        {**self.PREMISE, "Result": "passed\n## Win"},
                        {**self.PREMISE, "Result": 1}, "observed pass"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                events.repair_evidence_body(self.PR, body, premise=invalid)

    def test_ensure_repairs_premise_without_a_red_check_and_preserves_other_evidence(self):
        body = self.WIN + '<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n'
        written = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout=body)
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0, stdout="")

        self.assertTrue(events.ensure_red_before_green({"number": 7}, sh=shell, premise=self.PREMISE))
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0].startswith(body))
        self.assertIn("- Falsifying test: " + self.PREMISE["Falsifying test"], written[0])

    def test_explicit_measured_win_repairs_compounding_body_and_passes_fleet(self):
        body = events.red_before_green_block(self.PR)
        updated = events.repair_evidence_body(self.PR, body, win_section=self.WIN,
                                              customer_decision={"releaseWorthy": False})
        self.assertIn(body, updated)
        self.assertIn(self.WIN, updated)
        self.assertEqual(events.repair_evidence_body(self.PR, updated, win_section=self.WIN), updated)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const bodies = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(bodies.map(body => evaluateFleetRules({
  pr: {title: 'fix(music-resolver): repair certification', body, labels: ['compounding']}, files: [],
}).errors)));
"""], cwd=ROOT, input=json.dumps([body, updated]), text=True, capture_output=True, check=True)
        before, after = json.loads(checked.stdout)
        self.assertTrue(any(error.startswith("win:") for error in before), before)
        self.assertEqual(after, [])

    def test_measured_win_is_explicit_and_preserves_existing_decisions(self):
        body = events.red_before_green_block(self.PR)
        self.assertNotIn("## Win", events.repair_evidence_body(self.PR, body))
        for existing in ("## Win\n\nnone\n", self.WIN, "### Win\n\n- Claim: incomplete\n"):
            with self.subTest(existing=existing):
                original = body + "\n" + existing
                self.assertEqual(events.repair_evidence_body(self.PR, original, win_section=self.WIN), original)
        # A template in a comment or failure log is not the author's Win section.
        template = "\n<!--\n## Win\n-->\n```text\n## Win\n```\n"
        updated = events.repair_evidence_body(self.PR, body + template, win_section=self.WIN)
        self.assertTrue(updated.endswith(self.WIN))

    def test_measured_win_replacement_requires_the_observed_section(self):
        old = "## Win\n\n- Claim: Existing unmeasured claim\n"
        suffix = "## Verification\n\nKeep the original runtime proof.\n"
        body = events.red_before_green_block(self.PR) + "\n" + old + "\n" + suffix
        updated = events.repair_evidence_body(
            self.PR, body, win_section=self.WIN, previous_win_section=old,
            customer_decision={"releaseWorthy": False})
        self.assertNotIn(old, updated)
        self.assertIn(suffix, updated)
        self.assertEqual(updated.count("## Win"), 1)
        self.assertIn(self.WIN, updated)
        self.assertEqual(updated.count("customer-changelog/v1"), 1)
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const bodies = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(bodies.map(body => evaluateFleetRules({
  pr: {title: 'ci: repair annotation evidence', body}, files: [],
}).errors)));
"""], cwd=ROOT, input=json.dumps([body, updated]), text=True, capture_output=True, check=True)
        before, after = json.loads(checked.stdout)
        self.assertTrue(any(error.startswith("win:") for error in before), before)
        self.assertEqual(after, [])
        with self.assertRaisesRegex(ValueError, "Win section changed"):
            events.repair_evidence_body(self.PR, body.replace(old, self.WIN),
                                        win_section=self.WIN, previous_win_section=old)
        with self.assertRaisesRegex(ValueError, "replacement requires"):
            events.repair_evidence_body(self.PR, body, previous_win_section=old)
        with self.assertRaisesRegex(ValueError, "Win section changed"):
            events.repair_evidence_body(self.PR, suffix, win_section=self.WIN, previous_win_section=old)

    def test_ensure_can_write_measured_win_without_a_red_run(self):
        written = []
        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="Summary")
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0, stdout="")
        self.assertTrue(events.ensure_red_before_green({"number": 7}, sh=shell, win_section=self.WIN))
        self.assertEqual(written, ["Summary\n\n" + self.WIN])

    def test_measured_win_cannot_inject_other_repair_metadata(self):
        body = events.red_before_green_block(self.PR)
        body = events.repair_evidence_body(self.PR, body, customer_decision={"releaseWorthy": False})
        for injected in ("\n## Red-before-green\nReplacement proof\n",
                         "\n### Premise check\nFabricated observation\n",
                         '\n<!-- customer-changelog/v1 {"releaseWorthy":true} -->\n'):
            with self.subTest(injected=injected), self.assertRaisesRegex(ValueError, "only Win evidence"):
                events.repair_evidence_body(self.PR, body, win_section=self.WIN + injected)
        repaired = events.repair_evidence_body(self.PR, body, win_section=self.WIN,
                                               premise=self.PREMISE)
        self.assertTrue(repaired.startswith(body))
        self.assertEqual(repaired.count("customer-changelog/v1"), 1)
        self.assertEqual(repaired.count("## Red-before-green"), 1)
        self.assertEqual(repaired.count("## Win"), 1)
        self.assertEqual(repaired.count("## Premise check"), 1)

    def test_explicit_invalid_win_is_rejected_instead_of_silently_omitted(self):
        for invalid in (0, False, [], {}, "- Metric: incomplete"):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(ValueError, "complete ## Win section"):
                    events.repair_evidence_body(self.PR, "Summary", win_section=invalid)

    def test_new_win_is_validated_by_canonical_policy_before_publication(self):
        body = events.red_before_green_block(self.PR)
        invalid = (
            "## Win\n\nnone\n",
            "## Win\n\n- Claim: incomplete measurement\n",
            self.WIN.replace("| 1 | 0 |", "| unknown | 0 |"),
            self.WIN.replace("| 1 | 0 |", "| 1 | ? |"),
            self.WIN.replace("- Area: quality", "- Area: invented"),
        )
        for win in invalid:
            with self.subTest(win=win), self.assertRaisesRegex(ValueError, "canonical Win validation"):
                events.repair_evidence_body(self.PR, body, win_section=win)
            with self.subTest(replacement=win), self.assertRaisesRegex(ValueError, "canonical Win validation"):
                events.repair_evidence_body(self.PR, body + "\n" + self.WIN,
                                            win_section=win, previous_win_section=self.WIN)

    def test_pending_win_uses_the_canonical_pending_measurement_contract(self):
        win = self.WIN.replace("| 1 | 0 |", "| 1 | ? |") + "- Pending: yes\n"
        body = events.repair_evidence_body(self.PR, "Summary", win_section=win)
        self.assertTrue(body.endswith(win))

    def test_empty_optional_win_keeps_existing_caller_contract(self):
        body = events.repair_evidence_body(self.PR, "Summary")
        self.assertEqual(events.repair_evidence_body(self.PR, "Summary", win_section=""), body)

    def test_block_carries_the_failing_run_and_red_output_and_passes_the_parser_shape(self):
        block = events.red_before_green_block(self.PR, "### Source Validation\n# not a heading\nAssertionError: x")
        self.assertIn("Failing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/123", block)
        self.assertTrue(events.red_section_complete("Intro\n\n" + block + "\n\n## Next\nx"))
        self.assertNotIn("\n# not a heading", block, "a log line must not end the section")

    def test_failing_command_returns_the_run_failure_status(self):
        block = events.red_before_green_block(self.PR)
        self.assertIn(
            "- Failing command: `gh run watch 123 --repo JovieInc/Jovie --exit-status`",
            block,
        )
        self.assertIn(
            "- Failing run (before fix): https://github.com/JovieInc/Jovie/actions/runs/123",
            block,
        )

    def test_generated_block_passes_the_canonical_fleet_gate(self):
        block = events.red_before_green_block(self.PR, "### Failed step\nAssertionError: expected 200")
        checked = subprocess.run(
            ["node", "--input-type=module", "-e", """
                import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
                import { readFileSync } from 'node:fs';
                const body = readFileSync(0, 'utf8');
                const check = body => evaluateFleetRules({
                    pr: { title: 'fix(db): recover avatar reads', body }, files: [],
                }).errors;
                process.stdout.write(JSON.stringify({
                    generated: check(body), missing: check(''),
                }));
            """],
            cwd=ROOT, input=block, text=True, capture_output=True, check=True,
        )
        result = json.loads(checked.stdout)
        self.assertEqual(result["generated"], [])
        self.assertTrue(any(error.startswith("red-before-green:") for error in result["missing"]))

    def test_no_red_check_means_no_block(self):
        self.assertIsNone(events.red_before_green_block({"statusCheckRollup": [{"name": "x", "conclusion": "SUCCESS"}]}))

    def test_conflict_only_repair_records_observed_merge_failure_and_preserves_decision(self):
        pr = {"number": 23520, "headRefOid": "a" * 40, "mergeable": "CONFLICTING"}
        excerpt = (
            "Auto-merging apps/web/lib/chat/system-prompt.ts\n"
            "CONFLICT (content): Merge conflict in apps/web/lib/chat/system-prompt.ts\n"
            "Automatic merge failed; fix conflicts and then commit the result.\n"
        )
        body = 'Registry\n<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n'
        updated = events.repair_evidence_body(pr, body, excerpt, customer_decision={"releaseWorthy": False})
        self.assertTrue(events.red_section_complete(updated))
        self.assertIn("Failing command: `git merge origin/main --no-edit`", updated)
        self.assertIn("CONFLICT (content): Merge conflict in apps/web/lib/chat/system-prompt.ts", updated)
        self.assertNotIn("Failing run (before fix):", updated)
        self.assertEqual(updated.count("customer-changelog/v1"), 1)
        self.assertEqual(events.repair_evidence_body(pr, updated, excerpt), updated)
        self.assertIsNotNone(events.red_before_green_block({"mergeStateStatus": "DIRTY"}, excerpt))

    def test_conflict_state_without_observed_merge_failure_never_fabricates_red(self):
        conflict = "CONFLICT (content): Merge conflict in file.ts\n"
        failure = "Automatic merge failed; fix conflicts and then commit the result.\n"
        for pr, excerpt in (
            ({"mergeable": "CONFLICTING"}, ""),
            ({"mergeable": "CONFLICTING"}, conflict),
            ({"mergeable": "CONFLICTING"}, failure),
            ({"mergeable": "MERGEABLE"}, conflict + failure),
        ):
            with self.subTest(pr=pr, excerpt=excerpt):
                self.assertIsNone(events.red_before_green_block(pr, excerpt))

    def test_placeholder_section_is_replaced_and_complete_one_is_untouched(self):
        block = events.red_before_green_block(self.PR, "FAIL x")
        body = "## Summary\nx\n\n## Red-before-green\n\nFailing command:\n\n## Blast radius\ny\n"
        updated = events.with_red_section(body, block)
        self.assertTrue(events.red_section_complete(updated))
        self.assertIn("## Blast radius\ny", updated)
        self.assertEqual(updated.count("## Red-before-green"), 1)
        self.assertFalse(events.red_section_complete(body))

    def test_repair_body_keeps_existing_red_and_adds_an_explicit_customer_decision(self):
        body = "## Summary\nx\n\n" + events.red_before_green_block(self.PR)
        updated = events.repair_evidence_body(self.PR, body, customer_decision={"releaseWorthy": False})
        self.assertTrue(updated.startswith(body))
        self.assertIn('<!-- customer-changelog/v1 {"releaseWorthy":false} -->', updated)
        self.assertEqual(events.repair_evidence_body(self.PR, updated,
                                                   customer_decision={"releaseWorthy": False}), updated)

    def test_repair_preserves_fenced_red_logs_accepted_by_the_canonical_gate(self):
        bodies = [
            "## Red-before-green\n- Failing command: `node probe.mjs`\n\n"
            "```text\n# launcher probe\nFAIL status null\n```\n",
            "~~~markdown\n## Red-before-green\nExample only.\n~~~\n\n"
            "## Red-before-green\n- Failing command: `node probe.mjs`\n\n"
            "```text\n### heap diagnostic\nError: launcher timed out\n```\n",
        ]
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
console.log(JSON.stringify(JSON.parse(readFileSync(0, 'utf8')).map(body =>
  evaluateFleetRules({pr: {title: 'fix: preserve red logs', body}, files: []}).errors
)));
"""], cwd=ROOT, input=json.dumps(bodies), text=True, capture_output=True, check=True, timeout=15)
        self.assertEqual(json.loads(checked.stdout), [[], []])
        for body in bodies:
            with self.subTest(body=body):
                self.assertTrue(events.red_section_complete(body))
                updated = events.repair_evidence_body(self.PR, body, "FAIL newer run",
                                                      customer_decision={"releaseWorthy": False})
                self.assertTrue(updated.startswith(body))
                self.assertNotIn("FAIL newer run", updated)
                self.assertEqual(updated.count("customer-changelog/v1"), 1)
                self.assertEqual(events.repair_evidence_body(self.PR, updated), updated)

    def test_replacement_ignores_fenced_headings_and_preserves_the_next_section(self):
        example = "```markdown\n## Red-before-green\nExample only.\n```\n\n"
        following = "## Blast radius\nKeep existing proof.\n"
        body = (example + "## Red-before-green\n- Failing command: `<cmd>`\n\n"
                "```text\n# diagnostic\nFAIL incomplete command\n```\n\n" + following)
        block = events.red_before_green_block(self.PR, "FAIL real run")
        updated = events.with_red_section(body, block)
        self.assertTrue(updated.startswith(example + block))
        self.assertTrue(updated.endswith(following))
        self.assertNotIn("FAIL incomplete command", updated)
        self.assertTrue(events.red_section_complete(updated))
        self.assertTrue(events.with_red_section(example + following, block).startswith(example + following))

    def test_replacement_ignores_comment_fences_without_deleting_following_proof(self):
        following = "## Blast radius\nPreserve existing proof.\n\n## Review\nPreserve verdict.\n"
        body = ("## Red-before-green\n- Failing command: <cmd>\n\n"
                "<!-- reviewer scratch\n```text\n-->\n\n" + following)
        updated = events.repair_evidence_body(self.PR, body, "FAIL real run")
        self.assertTrue(events.red_section_complete(updated))
        self.assertTrue(updated.endswith(following))

    def test_explicit_locking_pr_repairs_missing_provenance_and_passes_fleet(self):
        body = events.red_before_green_block(self.PR)
        updated = events.repair_evidence_body(self.PR, body, locking_pr=23295,
                                              customer_decision={"releaseWorthy": False})
        checked = subprocess.run(
            ["node", "--input-type=module", "-e", r"""
                import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
                import { readFileSync } from 'node:fs';
                const body = readFileSync(0, 'utf8');
                const check = body => evaluateFleetRules({
                    pr: { title: 'fix: repair secret metadata evidence', body },
                    files: [{ filename: 'ops/registry/secrets-lint-baseline.json', status: 'added' }],
                }).errors;
                process.stdout.write(JSON.stringify({ repaired: check(body),
                    missing: check(body.replace(/## Locked areas[\s\S]*/, '')) }));
            """], cwd=ROOT, input=updated, text=True, capture_output=True, check=True,
        )
        result = json.loads(checked.stdout)
        self.assertEqual(result["repaired"], [])
        self.assertTrue(any(error.startswith("locked-areas:") for error in result["missing"]))
        self.assertEqual(events.repair_evidence_body(self.PR, updated, locking_pr=23295), updated)
        self.assertEqual(updated.count("customer-changelog/v1"), 1)

    def test_locking_reference_is_explicit_validated_and_never_overwrites_authority(self):
        body = events.red_before_green_block(self.PR)
        self.assertNotIn("## Locked areas", events.repair_evidence_body(self.PR, body))
        for reference in ("GBrain: security/secrets-audit", "Locking PR: #123", "GBrain: <slug>"):
            original = body + "\n## Locked areas\n" + reference + "\n"
            self.assertEqual(events.repair_evidence_body(self.PR, original, locking_pr=23295), original)
        for invalid in (0, -1, True, "23295"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                events.repair_evidence_body(self.PR, body, locking_pr=invalid)

    def test_public_decision_round_trips_without_comment_injection(self):
        decision = {"releaseWorthy": True, "text": "Choose a link --> continue"}
        updated = events.repair_evidence_body(self.PR, "Summary: customer-changelog/v1 is missing", customer_decision=decision)
        marker = updated.split("<!-- customer-changelog/v1 ", 1)[1].split(" -->", 1)[0]
        self.assertEqual(json.loads(marker), decision)
        self.assertNotIn("Choose a link -->", updated)

    def test_repair_body_never_infers_or_overwrites_a_customer_decision(self):
        body = "## Summary\nx"
        self.assertNotIn("customer-changelog/v1", events.repair_evidence_body(self.PR, body))
        for existing in ('{"releaseWorthy":true}', 'malformed'):
            with self.subTest(existing=existing):
                original = body + "\n<!-- customer-changelog/v1 " + existing + " -->"
                updated = events.repair_evidence_body(self.PR, original,
                                                      customer_decision={"releaseWorthy": False})
                self.assertIn("<!-- customer-changelog/v1 " + existing + " -->", updated)
                self.assertEqual(updated.count("customer-changelog/v1"), 1)
        with self.assertRaises(ValueError):
            events.repair_evidence_body(self.PR, body, customer_decision={"releaseWorthy": "false"})

    def test_ensure_can_repair_customer_metadata_when_red_evidence_is_already_complete(self):
        body = events.red_before_green_block(self.PR)
        written = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout=body)
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0, stdout="")

        self.assertTrue(events.ensure_red_before_green(self.PR, sh=shell,
                                                      customer_decision={"releaseWorthy": False}))
        self.assertEqual(len(written), 1)
        self.assertTrue(events.red_section_complete(written[0]))
        self.assertIn('<!-- customer-changelog/v1 {"releaseWorthy":false} -->', written[0])

    def test_ensure_writes_explicit_locking_provenance_without_a_red_run(self):
        written = []

        def shell(args):
            if args[:2] == ["pr", "view"]:
                return SimpleNamespace(returncode=0, stdout="Summary")
            written.append(Path(args[args.index("--body-file") + 1]).read_text())
            return SimpleNamespace(returncode=0, stdout="")

        self.assertTrue(events.ensure_red_before_green({"number": 23295}, sh=shell, locking_pr=23295))
        self.assertEqual(written, ["Summary\n\n## Locked areas\n\nLocking PR: #23295\n"])

    def test_ensure_edits_only_an_incomplete_body(self):
        for body, edits in (("## Summary\nx", 1), (events.red_before_green_block(self.PR), 0)):
            shell = Shell({("pr", "view"): (0, body), ("pr", "edit"): (0, "")})
            events.ensure_red_before_green(self.PR, "FAIL x", shell)
            self.assertEqual(len(shell.made("pr", "edit")), edits)

    def test_ensure_repairs_evidence_rejected_by_fleet_rules(self):
        run_url = "https://github.com/JovieInc/Jovie/actions/runs/123"
        cases = [("<cmd>", run_url), ("not applicable", run_url),
                 ("...", run_url), ("node --test", "https://example.com/red"),
                 ("node --test", run_url + "/job/456")]
        bodies = []
        # 'fix(ci): ...' is compounding/throughput work, so since the wins ledger (2026-10-29)
        # fleet rules also demand a measured Win section — the pull-request template ships one.
        # The bodies carry a valid measured Win so the only expected before-error is the
        # red-before-green one and the repaired body evaluates clean end to end.
        win_section = (
            "\n## Win\n\n- Claim: repair-evidence edits stopped failing the fleet-rules consumer\n"
            "- Area: ci\n- Theme: merge-throughput\n"
            "- Metric: fleet-rules-rejects | count | lower | 3 | 0 | fleet-rules-evidence workflow log | "
            "gh run list --workflow=fleet-rules-evidence.yml\n"
            "- Verify: https://github.com/JovieInc/Jovie/actions/runs/123\n"
        )
        for command, url in cases:
            body = (f"## Summary\nKeep this.\n\n## Red-before-green\n"
                    f"- Failing command: `{command}`\n- Failing run (before fix): {url}\n"
                    "\n## Blast radius\nWhat could break: repair evidence.\nProof: regression tests.\n"
                    + win_section)
            written = []
            def edit(args):
                written.append(Path(args[-1]).read_text())
                return (0, "")
            shell = Shell({("pr", "view"): (0, body), ("pr", "edit"): edit})
            with self.subTest(command=command, url=url):
                self.assertTrue(events.ensure_red_before_green(self.PR, sh=shell))
                self.assertEqual(len(written), 1)
                self.assertIn("## Summary\nKeep this.", written[0])
                self.assertIn("## Blast radius\nWhat could break: repair evidence.", written[0])
                self.assertIn(win_section, written[0])
                bodies.extend([body, written[0]])
        # Exercise the actual consumer, rather than trusting the Python mirror.
        checked = subprocess.run(["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { evaluateFleetRules } from './scripts/pr-fleet-rules.mjs';
const bodies = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(bodies.map(body => evaluateFleetRules({
  pr: {title: 'fix(ci): repair evidence', body, labels: []}, files: [],
}).errors)));
"""], cwd=ROOT, input=json.dumps(bodies), text=True, capture_output=True, timeout=15)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        verdicts = json.loads(checked.stdout)
        self.assertEqual(len(verdicts), len(cases) * 2)
        for before, after in zip(verdicts[::2], verdicts[1::2]):
            self.assertTrue(any(error.startswith("red-before-green:") for error in before), before)
            self.assertEqual(after, [])
