import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import machine_gap as gap  # noqa: E402
import remediation  # noqa: E402
import execution_attempt  # noqa: E402

NOW = 2_000_000_000.0


class RepairLearningTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name)

    def claim(self, pr=1, key="specific-signature"):
        receipt = {"kind": "fix-red", "provider": "codex", "runId": f"repair-{pr}", "pr": pr,
                   "repository": "JovieInc/Jovie", "headBefore": str(pr % 10) * 40,
                   "failureFingerprint": {"cls": "lint", "key": key}, "startedAt": "start"}
        ident = execution_attempt.identity("pr-remediation", {"pr": pr}, receipt["headBefore"])
        attempt = execution_attempt.claim(self.state / "runs/execution-attempts.jsonl", ident,
            {"tool": "fix_red_pr", "provider": "codex"},
            {"attempts": 3, "concurrency": 1, "wallSeconds": 1000, "spend": 3,
             "mutations": 3, "leaseSeconds": 900},
            {"triggerId": receipt["runId"], "causationId": receipt["headBefore"], "correlationId": f"pr-{pr}"},
            now=NOW, coordination={"kind": "local-test"})
        return receipt, attempt

    def prepare(self, receipt, attempt):
        context = gap.prepare_repair(self.state, receipt, attempt, now=NOW + 1)
        receipt["repairLearning"] = context
        return context

    def finish(self, receipt, attempt):
        receipt.update(verdict="fix-pushed", headAfter="a" * 40, endedAt="end")
        receipt["execution"] = execution_attempt.finish(self.state / "runs/execution-attempts.jsonl", attempt,
            attempt["fencingToken"], "succeeded", {"evidenceDigest": execution_attempt.digest(
                {"before": receipt["headBefore"], "after": receipt["headAfter"]})},
            now=NOW + 2, coordination={"kind": "local-test"})

    def test_second_distinct_admitted_attempt_creates_one_cause_task(self):
        first, a = self.claim()
        one = self.prepare(first, a)
        self.assertEqual(one["occurrences"], 1)
        self.assertIsNone(one["causeTask"])
        self.assertEqual(self.prepare(first, a)["occurrences"], 1, "replay is not recurrence")
        second, b = self.claim(2)
        two = self.prepare(second, b)
        self.assertEqual(two["occurrences"], 2)
        path = self.state / "factory-signals" / f"{two['causeTask']}.json"
        before = path.read_bytes()
        self.prepare(second, b)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(len(list(path.parent.glob("*.json"))), 1)
        self.assertEqual(len(json.loads(before)["evidence"]["attempts"]), 2)
        self.assertEqual(gap.RECUR_N, 3, "feature policy is unchanged")

    def test_unverified_expired_or_ended_claim_does_not_admit_learning(self):
        receipt, attempt = self.claim()
        for change in ({"fencingToken": "forged"}, {"admitted": False}):
            with self.assertRaisesRegex(ValueError, "unverified"):
                gap.prepare_repair(self.state, receipt, {**attempt, **change}, now=NOW + 1)
        with self.assertRaisesRegex(ValueError, "unverified"):
            gap.prepare_repair(self.state, receipt, attempt, now=NOW + 901)
        self.finish(receipt, attempt)
        with self.assertRaisesRegex(ValueError, "unverified"):
            self.prepare(receipt, attempt)

    def test_other_specific_class_and_forged_prior_do_not_count(self):
        receipt, attempt = self.claim()
        self.prepare(receipt, attempt)
        forged = {"schema": gap.REPAIR_SCHEMA, "event": "started", "fp": "repair:specific-signature",
                  "fingerprint": {"cls": "lint", "key": "specific-signature"},
                  "attemptId": "f" * 64 + ":" + "e" * 64, "at": NOW}
        with (self.state / gap.LEDGER).open("a") as out:
            out.write(json.dumps(forged) + "\n")
        self.assertEqual(self.prepare(receipt, attempt)["occurrences"], 1)
        other, b = self.claim(2, "different-signature")
        self.assertEqual(self.prepare(other, b)["occurrences"], 1)

    def test_unknown_ledger_custody_fails_closed(self):
        receipt, attempt = self.claim()
        (self.state / gap.LEDGER).write_text("{torn")
        with self.assertRaises(ValueError):
            self.prepare(receipt, attempt)
        self.assertEqual(len(list((self.state / "factory-signals").glob("*.json"))), 1)

    def test_malformed_repair_rows_emit_cause_task_instead_of_undercounting(self):
        receipt, attempt = self.claim()
        original = self.prepare(receipt, attempt)
        for change in ({"at": None}, {"at": "not a number"}, {"at": float("nan")},
                       {"at": float("inf")}, {"at": True}, {"at": 10 ** 1000},
                       {"event": []}, {"event": {}}, {"event": None}, {"event": 7},
                       {"attemptId": []}, {"attemptId": {}}, {"fingerprint": {}}, {"fingerprint": []}):
            with self.subTest(change=change):
                (self.state / gap.LEDGER).write_text(json.dumps({**original, **change}) + "\n")
                with self.assertRaisesRegex(ValueError, "malformed"):
                    self.prepare(receipt, attempt)
                tasks = list((self.state / "factory-signals").glob("*.json"))
                self.assertEqual(len(tasks), 1)
                self.assertIn("unreadable", json.loads(tasks[0].read_text())["problem"])

    def test_completion_requires_finished_attempt_source_guard_and_fresh_brain_binding(self):
        receipt, attempt = self.claim()
        context = self.prepare(receipt, attempt)
        candidate = {"rootCause": "hypothesis: missing validation", "fixPattern": "validate once",
                     "guardPath": "scripts/tests/test_machine_gap.py", "patternPath": ".claude/rules/testing.md"}
        with self.assertRaisesRegex(ValueError, "unverified"):
            gap.complete_repair(self.state, receipt, attempt, candidate, guard_verified=True, brain=None)
        self.finish(receipt, attempt)
        record = gap.repair_record(context, receipt, candidate)
        brain = {"slug": "reports/engineering/repair-learning-" + attempt["fencingToken"],
                 "compiled_truth": "Repair-learning record: " + json.dumps(record, sort_keys=True),
                 "content_hash": "c" * 64}
        for guard, evidence in ((False, brain), (True, None), (True, {**brain, "slug": "stale"}),
                                (True, {**brain, "compiled_truth": "different attempt"})):
            row = gap.complete_repair(self.state, receipt, receipt["execution"], candidate,
                                      guard_verified=guard, brain=evidence)
            self.assertEqual(row["status"], "pending")
            self.assertFalse(row["gbrain"]["readbackVerified"])
            self.assertTrue(row["causeTask"])
        row = gap.complete_repair(self.state, receipt, receipt["execution"], candidate,
                                  guard_verified=True, brain=brain)
        self.assertEqual(row["status"], "source-and-brain-bound-ci-pending")
        self.assertTrue(row["gbrain"]["readbackVerified"])
        self.assertFalse(row["guard"]["ciVerified"], "source/readback is never actual CI proof")

    def test_model_prompt_retrieves_before_launch_and_names_exact_attempt_contract(self):
        import lane_runner as lane
        receipt, attempt = self.claim()
        host = lane.Host(state=self.state, repo=self.state)
        run = unittest.mock.Mock(return_value=SimpleNamespace(returncode=0, stdout="prior guard evidence"))
        # Keep the fixture's authenticated claim live without touching wall-clock policy.
        with patch.object(lane.machine_gap.time, "time", return_value=NOW + 1):
            text = lane.repair_learning_context(host, receipt, attempt, run=run)
        self.assertEqual(run.call_args.args[0], ["gbrain", "search", "specific-signature"])
        self.assertIn("prior guard evidence", text)
        self.assertIn(attempt["fencingToken"], text)
        self.assertIn("rootCause", text)
        self.assertEqual(receipt["repairLearning"]["retrieval"]["gbrain"], "retrieved")

    def test_completion_wrapper_independently_reads_published_paths_and_brain(self):
        import lane_runner as lane
        receipt, attempt = self.claim()
        context = self.prepare(receipt, attempt)
        self.finish(receipt, attempt)
        candidate = {"rootCause": "validation gap", "fixPattern": "validate once",
                     "guardPath": "scripts/tests/test_machine_gap.py", "patternPath": ".claude/rules/testing.md"}
        record = gap.repair_record(context, receipt, candidate)
        brain = {"slug": "reports/engineering/repair-learning-" + attempt["fencingToken"],
                 "content": "Repair-learning record: " + json.dumps(record, sort_keys=True),
                 "content_hash": "c" * 64}
        receipt["repairLearningCandidate"] = candidate
        run = unittest.mock.Mock(return_value=SimpleNamespace(returncode=0, stdout=json.dumps(brain)))
        def tree(args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=f"100644 blob {'a' * 40}\t{args[-1]}\0")
        with patch.object(lane, "sh", side_effect=tree) as shell:
            lane.finish_repair_learning(lane.Host(state=self.state, repo=self.state), receipt, run=run)
        self.assertEqual(shell.call_count, 2)
        self.assertEqual(run.call_args.args[0][:3], ["gbrain", "call", "get_page"])
        self.assertEqual(json.loads(run.call_args.args[0][3]), {"slug": brain["slug"], "include_content": True})
        self.assertTrue(receipt["repairLearning"]["gbrain"]["readbackVerified"])
        self.assertEqual(receipt["verdict"], "fix-pushed")
        self.assertIn("exitedAt", receipt["repairLearning"])

    def test_directory_and_symlink_do_not_bind_as_guard_source_files(self):
        import lane_runner as lane
        for mode, kind in (("040000", "tree"), ("120000", "blob")):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                # Fresh state so every case exercises its own finished attempt.
                previous, self.state = self.state, Path(tmp)
                try:
                    receipt, attempt = self.claim()
                    self.prepare(receipt, attempt)
                    self.finish(receipt, attempt)
                    receipt["repairLearningCandidate"] = {"rootCause": "gap", "fixPattern": "validate",
                                                           "guardPath": "scripts/tests", "patternPath": "rule.md"}
                    found = SimpleNamespace(returncode=0, stdout=f"{mode} {kind} {'a' * 40}\tscripts/tests\0")
                    with patch.object(lane, "sh", return_value=found):
                        lane.finish_repair_learning(lane.Host(state=self.state, repo=self.state), receipt,
                            run=lambda *_a, **_k: SimpleNamespace(returncode=1, stdout=""))
                    self.assertFalse(receipt["repairLearning"]["guard"]["sourceVerified"])
                    self.assertEqual(receipt["repairLearning"]["status"], "pending")
                finally:
                    self.state = previous

    def test_unavailable_brain_and_unsafe_guard_never_certify_learning(self):
        import lane_runner as lane
        receipt, attempt = self.claim()
        context = self.prepare(receipt, attempt)
        self.finish(receipt, attempt)
        receipt["repairLearningCandidate"] = {"rootCause": "gap", "fixPattern": "validate",
                                               "guardPath": "../outside", "patternPath": "rule.md"}
        run = unittest.mock.Mock(side_effect=OSError("offline"))
        with patch.object(lane, "sh") as shell:
            lane.finish_repair_learning(lane.Host(state=self.state, repo=self.state), receipt, run=run)
        shell.assert_not_called()
        self.assertEqual(receipt["repairLearning"]["status"], "pending")
        self.assertTrue(receipt["repairLearning"]["causeTask"])
        # Artifact readers reject symlinks, malformed JSON and excessive content.
        artifact = self.state / ".jovie-repair-learning.json"
        for content in ("not json", "[]", "x" * 16001):
            artifact.write_text(content)
            self.assertEqual(lane.read_repair_learning(self.state), {})
        artifact.unlink()
        artifact.symlink_to(self.state / gap.LEDGER)
        self.assertEqual(lane.read_repair_learning(self.state), {})

    def test_learning_timings_feed_registered_remediation_stages_without_claiming_ci(self):
        import stage_events
        start, end = "2026-11-02T10:00:00Z", "2026-11-02T10:00:05Z"
        row = {"runId": "r", "kind": "fix-red", "provider": "codex", "pr": 1,
               "headBefore": "a" * 40, "startedAt": start, "endedAt": end,
               "repairLearning": {"status": "pending", "enteredAt": start, "exitedAt": end,
                                  "retrieval": {"gbrain": "retrieved", "enteredAt": start, "exitedAt": end}}}
        events = stage_events.events(row)
        self.assertEqual([e["stage"] for e in events], ["repair-start", "learning-retrieval", "learning-record"])
        self.assertEqual(events[-1]["outcome"], "failed")
        self.assertEqual(events[-2]["outcome"], "advanced")
        self.assertTrue(all(e["sourceReceipt"] == "lanes-ledger:r" for e in events))
        manifest = json.loads((Path(__file__).resolve().parents[2] / "docs/metrics/stage-manifest.json").read_text())
        registered = {s["id"] for s in manifest["entities"]["remediation"]["stages"]}
        self.assertTrue({e["stage"] for e in events} <= registered)


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
