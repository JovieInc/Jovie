"""Factory intake: validated signals become deduped, measurable, agent-ready issues (hermetic)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import factory_intake as fi  # noqa: E402
import factory_signals as fs  # noqa: E402


def signal(fp="run-waste", **kw):
    row = {"schema": fi.SCHEMA, "fingerprint": fp, "source": "ledger", "title": "Cut fix-no-change runs",
           "problem": "18% of runs end fix-no-change.", "acceptance": ["no-op fixes skipped before a seat is taken"],
           "metric": {"name": "fix-no-change share", "baseline": 0.18, "target": 0.09}}
    row.update(kw)
    return row


class FakeLinear:
    def __init__(self, existing=()):
        self.existing, self.created, self.labels = set(existing), [], []

    def gql(self, query, variables):
        if query == fi.TEAM:
            return {"teams": {"nodes": [{"id": "t", "states": {"nodes": [{"id": "todo", "name": "Todo"}]},
                                         "labels": {"nodes": [{"id": "l-factory", "name": "factory"}]}}]}}
        if query == fi.EXISTING:
            return {"issues": {"nodes": [{"id": "x", "identifier": "JOV-1"}] if variables["l"] in self.existing else []}}
        if query == getattr(fi, "HISTORY", None):
            return {"issues": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}}
        if query == fi.LABEL_CREATE:
            self.labels.append(variables["i"]["name"])
            return {"issueLabelCreate": {"success": True, "issueLabel": {"id": "id-" + variables["i"]["name"]}}}
        self.created.append(variables["i"])
        return {"issueCreate": {"success": True, "issue": {"id": "n", "identifier": f"JOV-{100 + len(self.created)}"}}}


class EpisodeLinear(FakeLinear):
    """Honor the actual query's state filter, retaining filed bodies across terminal transitions."""
    def __init__(self):
        super().__init__()
        self.issues = []
        self.history_pages = []

    def gql(self, query, variables):
        if query == fi.EXISTING or query == getattr(fi, "HISTORY", None):
            rows = [r for r in self.issues if variables["l"] in r["labels"]]
            terminal = lambda r: r["state"] in {"completed", "canceled"}
            rows = [r for r in rows if terminal(r) == (query != fi.EXISTING)
                    and (not r.get("archived") or "includeArchived:true" in query)]
            # One row/page exercises the terminal-history pagination with real query semantics.
            start = int(variables.get("after") or 0)
            if query != fi.EXISTING:
                self.history_pages.append(variables.get("after"))
            return {"issues": {"nodes": rows[start:start + 1],
                               "pageInfo": {"hasNextPage": len(rows) > start + 1, "endCursor": str(start + 1)}}}
        result = super().gql(query, variables)
        if query == fi.CREATE:
            issue = result["issueCreate"]["issue"]
            self.issues.append({**issue, "description": variables["i"]["description"], "state": "started",
                                "labels": [n.removeprefix("id-") for n in variables["i"]["labelIds"]]})
        return result


class FactoryIntakeTest(unittest.TestCase):
    def test_validation_demands_acceptance_and_a_metric(self):
        self.assertIsNone(fi.validate(signal()))
        self.assertIn("acceptance", fi.validate(signal(acceptance=[])))
        self.assertIn("metric", fi.validate(signal(metric={"name": "x"})))
        self.assertIn("fingerprint", fi.validate(signal(fp="Bad Slug")))
        self.assertIn("schema", fi.validate({"fingerprint": "a-b"}))

    def test_issue_names_the_metric_that_must_move(self):
        item = fi.plan([signal()])[0]
        self.assertIn("## Definition of done", item["description"])
        self.assertIn("baseline 0.18, target 0.09", item["description"])
        self.assertEqual(item["labels"], ["factory", "ws:symphony-throughput", "factory-fp:run-waste"])

    def test_apply_dedupes_by_label_creates_labels_and_bounds_each_pass(self):
        linear = FakeLinear(existing={"factory-fp:a-1"})
        items = fi.plan([signal("a-1"), signal("b-2"), signal("c-3"), signal("d-4"), signal("e-5")])
        out = fi.apply(linear, items, limit=2)
        self.assertEqual([r["action"] for r in out], ["exists", "filed", "filed", "deferred", "deferred"])
        self.assertEqual(len(linear.created), 2)
        self.assertEqual(linear.created[0]["stateId"], "todo")
        self.assertIn("ws:symphony-throughput", linear.labels)

    def test_read_signals_reports_bad_files_and_run_pass_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "factory-signals"
            d.mkdir()
            (d / "ok.json").write_text(json.dumps(signal()))
            (d / "bad.json").write_text("{")
            (d / "weak.json").write_text(json.dumps(signal("w-1", acceptance=[])))
            good, bad = fi.read_signals(d)
            self.assertEqual(len(good), 1)
            self.assertEqual(len(bad), 2)

            class Down:
                def gql(self, *a):
                    raise RuntimeError("linear down")
            self.assertIn("error", fi.run_pass(Path(tmp), Down()))

    def test_completed_and_canceled_evidence_is_not_replayed_but_new_evidence_can_recur(self):
        for terminal in ("completed", "canceled"):
            with self.subTest(terminal=terminal), tempfile.TemporaryDirectory() as tmp:
                root, linear = Path(tmp), EpisodeLinear()
                (root / "doctor.json").write_text(json.dumps({"alerts": {"no-landing": "red"}}))
                for day in (21, 22, 23):
                    fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, day, tzinfo=timezone.utc)))
                first = fi.run_pass(root, linear)["results"][0]
                self.assertEqual(first["action"], "filed")
                linear.issues[-1].update(state=terminal, archived=True)
                (root / "doctor.json").write_text('{"alerts":{}}')
                fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, 24, tzinfo=timezone.utc)))
                replay = fi.run_pass(root, linear)["results"][0]
                self.assertEqual(replay["action"], "exists", "clearing an alarm must not replay the retained evidence file")
                self.assertEqual(replay["issue"], first["issue"])
                self.assertEqual(len(linear.created), 1)
                (root / "doctor.json").write_text('{"alerts":{"no-landing":"red"}}')
                fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, 25, tzinfo=timezone.utc)))
                self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "filed")
                self.assertEqual(len(linear.created), 2)
                # Fresh observations never replace unresolved work with another issue.
                fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, 26, tzinfo=timezone.utc)))
                self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
                linear.issues[-1]["state"] = terminal
                (root / "doctor.json").write_text('{"alerts":{}}')
                fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, 27, tzinfo=timezone.utc)))
                self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists",
                                 "evidence seen while unresolved is covered even after completion and clearance")
                self.assertEqual(len(linear.created), 2)
                (root / "doctor.json").write_text('{"alerts":{"no-landing":"red again"}}')
                fs.write(root, fs.sentinel_signals(root, datetime(2026, 10, 28, tzinfo=timezone.utc)))
                self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "filed")
                self.assertEqual(len(linear.created), 3)
                # An older episode still dedupes even behind other terminal issues.
                oldest = dict(fi.plan([json.loads((root / "factory-signals/sentinel-no-landing.json").read_text())])[0])
                oldest["description"] = linear.issues[0]["description"]
                linear.issues[-1]["state"] = terminal
                # The newest episode is third in history; finding it requires pagination.
                self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
                self.assertEqual(fi.apply(linear, [oldest])[0]["issue"], first["issue"])

    def test_legacy_terminal_body_dedupes_only_the_same_evidence(self):
        linear = EpisodeLinear()
        item = fi.plan([signal()])[0]
        legacy_body = item["description"].split("\n\n<!-- factory-evidence:")[0]
        linear.issues.append({"id": "other", "identifier": "JOV-0", "description": "Different evidence",
                              "state": "completed", "labels": item["labels"]})
        linear.issues.append({"id": "old", "identifier": "JOV-1", "description": legacy_body,
                              "state": "completed", "labels": item["labels"]})
        self.assertEqual(fi.apply(linear, [item])[0]["action"], "exists")
        self.assertIn("1", linear.history_pages)
        self.assertEqual(fi.apply(linear, fi.plan([signal(problem="Fresh evidence: 20% of runs.")]))[0]["action"], "filed")


    def test_receipt_identity_distinguishes_new_evidence_with_the_same_summary(self):
        linear = EpisodeLinear()
        first = signal(evidence={"receipts": ["a", "b", "c", "d", "e"]})
        fi.apply(linear, fi.plan([first]))
        linear.issues[-1]["state"] = "completed"
        # Wording edits do not manufacture a new observation for an explicit evidence set.
        self.assertEqual(fi.apply(linear, fi.plan([{**first, "problem": "Reworded summary"}]))[0]["action"], "exists")
        newer = {**first, "evidence": {"receipts": ["f", "g", "h", "i", "j"]}}
        self.assertEqual(fi.apply(linear, fi.plan([newer]))[0]["action"], "filed")

    def test_history_failure_never_creates_an_issue_and_run_pass_contains_it(self):
        for reply in (RuntimeError("history down"),
                      {"issues": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "stuck"}}}):
            class BrokenHistory(FakeLinear):
                def gql(self, query, variables):
                    if query == fi.HISTORY:
                        if isinstance(reply, Exception):
                            raise reply
                        return reply
                    return super().gql(query, variables)
            with self.subTest(reply=reply), tempfile.TemporaryDirectory() as tmp:
                root, linear = Path(tmp), BrokenHistory()
                fs.write(root, [signal()])
                self.assertIn("error", fi.run_pass(root, linear))
                self.assertEqual(linear.created, [])
                self.assertTrue((root / "factory-signals/run-waste.json").exists())



    def test_unreadable_receipts_fail_closed_without_filing_or_discarding_signals(self):
        for content in ("{", "[]", '{"run-waste": []}'):
            with self.subTest(content=content), tempfile.TemporaryDirectory() as tmp:
                root, linear = Path(tmp), EpisodeLinear()
                fs.write(root, [signal()])
                (root / "factory-intake.json").write_text(content)
                self.assertIn("error", fi.run_pass(root, linear))
                self.assertEqual(linear.created, [])
                self.assertTrue((root / "factory-signals/run-waste.json").exists())

if __name__ == "__main__":
    unittest.main()
