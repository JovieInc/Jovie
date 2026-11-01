import hashlib
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import machine_gap as gap  # noqa: E402
import remediation  # noqa: E402

NOW = 2_000_000_000.0


class GateTest(unittest.TestCase):
    def test_a_cancelled_sibling_does_not_define_a_second_fix_red_class(self):
        failed = {"statusCheckRollup": [
            {"name": "Source Validation", "conclusion": "FAILURE"},
            {"name": "PR Ready", "conclusion": "FAILURE"},
        ]}
        mixed = {"statusCheckRollup": [
            {"name": "Source Validation", "conclusion": "FAILURE"},
            {"name": "Fleet Rules Evidence", "conclusion": "CANCELLED"},
            {"name": "PR Ready", "conclusion": "FAILURE"},
        ]}
        cancelled = {"statusCheckRollup": [{"name": "Fleet Rules Evidence", "conclusion": "CANCELLED"}]}
        solo = gap.check_fingerprint(failed)
        self.assertEqual(gap.check_fingerprint(mixed), solo)
        self.assertNotEqual(gap.check_fingerprint(cancelled), solo)
        self.assertEqual(solo, "fix-red-" + hashlib.sha256(b"Source Validation").hexdigest()[:10])
        pair = "fix-red-" + hashlib.sha256(b"Fleet Rules Evidence|Source Validation").hexdigest()[:10]
        self.assertEqual(pair, "fix-red-6c3efaf400")
        self.assertNotEqual(solo, pair)

    def test_fingerprint_ignores_ids_and_numbers_and_honours_explicit_labels(self):
        a = gap.fingerprint("fix: JOV-9001 sentry error 42 in profile page", [])
        b = gap.fingerprint("Fix Sentry error 77 in profile page (JOV-9100)", [])
        self.assertEqual(a, b)
        self.assertNotEqual(a, gap.fingerprint("billing webhook retries", []))
        self.assertEqual(gap.fingerprint("anything", ["remediation:stripe-reconcile"]), "stripe-reconcile")

    def test_third_occurrence_inside_14_days_requires_the_machine(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            for index, subject in enumerate(("JOV-1", "JOV-2")):
                decision = gap.decide(state, "fp1", now=NOW + index)
                self.assertFalse(decision["required"], decision)
                gap.record(state, "fp1", "lane-run", subject, now=NOW + index)
            third = gap.decide(state, "fp1", now=NOW + 10)
            self.assertEqual((third["required"], third["reason"], third["occurrences"]), (True, "recurrence", 3))
            # the same subject recorded twice is one occurrence; an old occurrence ages out
            gap.record(state, "fp1", "lane-run", "JOV-2", now=NOW + 20)
            self.assertEqual(len(gap.occurrences(gap.read(state), "fp1", NOW + 30)), 2)
            late = gap.decide(state, "fp1", now=NOW + gap.WINDOW_S + 5)
            self.assertFalse(late["required"])

    def test_projected_cost_above_ten_dollars_requires_the_machine(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(gap.decide(Path(tmp), "x", "Estimated cost: $12", now=NOW)["required"])
            self.assertFalse(gap.decide(Path(tmp), "x", "Estimated cost: $4", now=NOW)["required"])
            gap.record(Path(tmp), "y", "lane-run", "A", est_usd=6.0, now=NOW)
            decision = gap.decide(Path(tmp), "y", est_usd=5.0, now=NOW + 1)
            self.assertEqual((decision["required"], decision["reason"]), (True, "cost"))

    def test_waivers_cover_one_time_migrations_and_incidents_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            costly = "Estimated cost: $50"
            self.assertEqual(gap.decide(Path(tmp), "x", costly + "\nMachine-gap waiver: one-time-migration", now=NOW)["waived"],
                             "one-time-migration")
            self.assertFalse(gap.decide(Path(tmp), "x", costly, labels=["incident"], now=NOW)["required"])
            self.assertTrue(gap.decide(Path(tmp), "x", costly + "\nMachine-gap waiver: because", labels=["bug"], now=NOW)["required"])

    def test_clause_states_the_obligation_and_the_escape_hatches(self):
        with tempfile.TemporaryDirectory() as tmp:
            lines = "\n".join(gap.clause(gap.decide(Path(tmp), "fp", "Estimated cost: $50", now=NOW)))
        for needle in ("REQUIRED", "machine-gap", "Machine: built", "Machine-gap: <issue identifier>", "one-time-migration", "incident"):
            self.assertIn(needle, lines)
        quiet = "\n".join(gap.clause(gap.decide(Path("/nonexistent-state"), "fp", now=NOW)))
        self.assertNotIn("REQUIRED", quiet)
        self.assertIn("Before one-off work", quiet)

    def test_machine_line_is_read_from_a_pr_body(self):
        self.assertEqual(gap.machine_line("x\nMachine: built scripts/lanes/fix_red_classes.py\n"), "built scripts/lanes/fix_red_classes.py")
        self.assertEqual(gap.machine_line("Machine-gap: JOV-9"), "JOV-9")
        self.assertIsNone(gap.machine_line("no marker"))

    def test_recurring_lists_fingerprints_at_the_threshold(self):
        with tempfile.TemporaryDirectory() as tmp:
            for subject in ("a", "b", "c"):
                gap.record(Path(tmp), "hot", "lane-run", subject, now=NOW)
            gap.record(Path(tmp), "cold", "lane-run", "a", now=NOW)
            self.assertEqual(gap.recurring(Path(tmp), NOW + 1), {"hot": 3})


class PromptTest(unittest.TestCase):
    def test_coder_and_fix_prompts_carry_the_gate_and_the_ledger_counts_the_run(self):
        import lane_runner as lane
        with tempfile.TemporaryDirectory() as tmp:
            host = lane.Host(state=Path(tmp), repo=Path(tmp))
            issue = lane.Issue(id="i", identifier="JOV-5", title="Fix flaky profile test", description="Estimated cost: $30",
                               priority=2, created_at="2026-10-01T00:00:00Z", labels=[])
            receipt = {}
            clause = lane.machine_gate(host, issue.identifier, issue.title, issue.labels, issue.description, "codex", receipt=receipt)
            prompt = lane.render_prompt(issue, "codex/jov-5", "ctx", provider="codex", machine=clause)
            self.assertIn("## Abstraction gate", prompt)
            self.assertIn("REQUIRED", prompt)
            self.assertTrue(receipt["machineGate"]["required"])
            self.assertEqual(len(gap.read(Path(tmp))), 1)
            # the other prompt kinds render the same clause from the same function
            pr = {"number": 4, "statusCheckRollup": [{"name": "Source Validation", "conclusion": "FAILURE"}]}
            fix = lane.machine_gate(host, "PR4", "", (), "", "codex", fp=gap.check_fingerprint(pr))
            self.assertTrue(any("Abstraction gate" in line for line in fix))

    def test_binding_and_epic_prompts_carry_the_gate_too(self):
        import bindings
        import epics
        binding = SimpleNamespace(slug="JovieInc/LogYourBody", key="LYB")
        pr = {"number": 3, "headRefOid": "h", "statusCheckRollup": [{"name": "Lint", "conclusion": "FAILURE"}]}
        clause = ["## Abstraction gate (build the machine, not the thing)", "- REQUIRED: x"]
        repair = bindings.render_prompt(binding, "fix/x", pr=pr, machine=clause)
        issue = SimpleNamespace(title="t", identifier="LYB-1", description="d")
        coder = bindings.render_prompt(binding, "b", issue=issue, machine=clause)
        for prompt in (repair, coder):
            self.assertIn("## Abstraction gate", prompt)
            self.assertLess(prompt.index("Abstraction gate"), prompt.index("## Contract"))
        plan = epics.render_prompt(SimpleNamespace(identifier="JOV-1", title="e", description="d"), [])
        self.assertIn("Build the machine, not the thing", plan)
        self.assertIn("machine-gap", plan)

    def test_a_broken_ledger_never_fails_the_run(self):
        import lane_runner as lane
        host = lane.Host(state=Path("/proc/does-not-exist"), repo=Path("/"))
        self.assertIsInstance(lane.machine_gate(host, "JOV-1", "t", [], "", "codex"), list)


class RemediationRecurrenceTest(unittest.TestCase):
    def issue(self, ident, state, updated):
        return {"id": "id-" + ident, "identifier": ident, "title": "e2e-login-timeout", "description": "",
                "createdAt": "2026-10-01T00:00:00Z", "updatedAt": updated, "url": "u",
                "state": {"name": "Todo" if state == "unstarted" else "Done", "type": state},
                "team": {"key": "JOV", "states": {"nodes": [{"id": "todo", "name": "Todo", "type": "unstarted"}]}},
                "labels": {"nodes": [{"id": "l", "name": "remediation:e2e-login-timeout"}]}}

    def stamp(self, days_ago):
        return datetime.fromtimestamp(NOW - days_ago * 86400, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def providers(self):
        return {"codex": {"enabled": True, "tier": 1}}

    def plan(self, closed_days):
        issues = [self.issue("JOV-9", "unstarted", self.stamp(0))] + [
            self.issue(f"JOV-{i}", "completed", self.stamp(days)) for i, days in enumerate(closed_days, 1)]
        return remediation.plan_labeled_events(issues, {}, self.providers(), NOW, healthy=lambda *_: True)["events"]["e2e-login-timeout"]

    def test_third_occurrence_in_14_days_becomes_a_machine_builder_task(self):
        row = self.plan([2, 5])
        self.assertTrue(row["machineBuilder"])
        self.assertIn("Machine-builder task", row["dossier"])
        self.assertIn("Blocker class", row["dossier"], "the ordinary dossier is kept")

    def test_older_or_fewer_recurrences_keep_the_ordinary_task(self):
        for closed in ([2], [20, 30], []):
            row = self.plan(closed)
            self.assertFalse(row["machineBuilder"], closed)
            self.assertNotIn("Machine-builder task", row["dossier"])


if __name__ == "__main__":
    unittest.main()
