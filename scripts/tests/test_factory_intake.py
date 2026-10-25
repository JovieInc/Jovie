"""Factory intake: validated signals become deduped, measurable, agent-ready issues (hermetic)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import factory_intake as fi  # noqa: E402


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
        if query == fi.LABEL_CREATE:
            self.labels.append(variables["i"]["name"])
            return {"issueLabelCreate": {"success": True, "issueLabel": {"id": "id-" + variables["i"]["name"]}}}
        self.created.append(variables["i"])
        return {"issueCreate": {"success": True, "issue": {"id": "n", "identifier": f"JOV-{100 + len(self.created)}"}}}


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


if __name__ == "__main__":
    unittest.main()
