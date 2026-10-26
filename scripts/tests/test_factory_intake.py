"""Factory intake: validated signals become deduped, measurable, agent-ready issues (hermetic)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

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


    def test_open_period_receipt_write_failure_does_not_replay_after_completion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, linear = Path(tmp), EpisodeLinear()
            fs.write(root, [signal(problem="first", evidence={"days": ["2026-10-21", "2026-10-22", "2026-10-23"]})])
            fi.run_pass(root, linear)
            fs.write(root, [signal(problem="updated while open", evidence={"days": ["2026-10-22", "2026-10-23", "2026-10-24"]})])
            with mock.patch.object(fi, "atomic_write_text", side_effect=OSError("fixture disk full")):
                self.assertIn("error", fi.run_pass(root, linear))
            linear.issues[0].update(state="completed", completedAt=datetime.now(timezone.utc).isoformat())
            self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
            self.assertEqual(len(linear.created), 1)
            fs.write(root, [signal(problem="observed after completion", evidence={"days": ["2026-10-23", "2026-10-24", "2026-10-25"]})])
            self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "filed")

    def test_old_format_signal_rollback_keeps_the_same_rendered_evidence_covered(self):
        linear = EpisodeLinear()
        fi.apply(linear, fi.plan([signal(evidence={"days": ["a", "b", "c"]})]))
        linear.issues[-1]["state"] = "completed"
        self.assertEqual(fi.apply(linear, fi.plan([signal()]))[0]["action"], "exists")
        self.assertEqual(len(linear.created), 1)


    def test_covered_cheap_fixer_receipt_loss_never_replays_but_a_new_receipt_qualifies(self):
        for loss in ("deleted", "malformed"):
            for terminal in ("completed", "canceled"):
                with self.subTest(loss=loss, terminal=terminal), tempfile.TemporaryDirectory() as tmp:
                    root, linear = Path(tmp), EpisodeLinear()
                    receipts = root / "cheap-fixer"
                    receipts.mkdir()
                    row = {"schema": "jovie-cheap-fixer-receipt/v1", "failureClass": "lint",
                           "outcome": "handoff-model-failed", "classMatch": "x"}
                    for i in range(6):
                        (receipts / f"receipt-{i}.json").write_text(json.dumps(row))
                    def scan():
                        signals = fs.cheap_fixer_signals(receipts)
                        fs.write(root, signals)
                        return fi.run_pass(root, linear)["results"][0]
                    first = scan()
                    self.assertEqual(first["action"], "filed")
                    linear.issues[-1]["state"] = terminal
                    lost = receipts / "receipt-0.json"
                    if loss == "deleted":
                        lost.unlink()
                    else:
                        lost.write_text("{")
                    self.assertEqual(scan()["action"], "exists", "loss of one covered receipt is not an observation")
                    self.assertEqual(len(linear.created), 1)
                    # Reordering the same five receipt identities is not a fresh episode either.
                    retained = fs.cheap_fixer_signals(receipts)[0]
                    retained["evidence"]["receipts"].reverse()
                    fs.write(root, [retained])
                    self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
                    # Five covered receipts plus one genuinely new receipt are actionable.
                    (receipts / "new-receipt.json").write_text(json.dumps(row))
                    self.assertEqual(scan()["action"], "filed")
                    self.assertEqual(len(linear.created), 2)
                    # Covered units remain covered across another completion and loss.
                    linear.issues[-1]["state"] = terminal
                    (receipts / "receipt-1.json").unlink()
                    self.assertEqual(scan()["action"], "exists")
                    self.assertEqual(len(linear.created), 2)

    def test_receipt_coverage_bootstraps_legacy_digest_state_and_survives_state_loss(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, linear = Path(tmp), EpisodeLinear()
            original = signal(evidence={"receipts": ["a", "b", "c", "d", "e", "f"]})
            fs.write(root, [original])
            fi.run_pass(root, linear)
            path = root / "factory-intake.json"
            # The old format has only opaque episode digests, all with string issue values.
            covered = json.loads(path.read_text())
            for episodes in covered.values():
                for key in list(episodes):
                    if key.startswith("receipt:"):
                        del episodes[key]
            path.write_text(json.dumps(covered))
            self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
            linear.issues[-1]["state"] = "completed"
            subset = {**original, "evidence": {"receipts": ["b", "c", "d", "e", "f"]}}
            fs.write(root, [subset])
            self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
            # The terminal issue's receipt evidence also protects recovery without a local map.
            path.unlink()
            self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
            self.assertEqual(len(linear.created), 1)


    def test_first_scan_after_legacy_upgrade_can_already_be_a_receipt_subset(self):
        for state_format in ("digest-only", "missing"):
            for old_body in ("digest", "plain"):
                with self.subTest(state_format=state_format, old_body=old_body), tempfile.TemporaryDirectory() as tmp:
                    root, linear = Path(tmp), EpisodeLinear()
                    receipts = root / "cheap-fixer"
                    receipts.mkdir()
                    row = {"schema": "jovie-cheap-fixer-receipt/v1", "failureClass": "lint",
                           "outcome": "handoff-model-failed", "classMatch": "x"}
                    for i in range(6):
                        (receipts / f"{i}.json").write_text(json.dumps(row))
                    fs.write(root, fs.cheap_fixer_signals(receipts))
                    fi.run_pass(root, linear)
                    linear.issues[0]["state"] = "completed"
                    linear.issues[0]["description"] = fi.RECEIPTS.sub("", linear.issues[0]["description"])
                    if old_body == "plain":
                        linear.issues[0]["description"] = fi.EVIDENCE.sub("", linear.issues[0]["description"])
                    path = root / "factory-intake.json"
                    if state_format == "missing":
                        path.unlink()
                    else:
                        covered = json.loads(path.read_text())
                        for episodes in covered.values():
                            for key in list(episodes):
                                if key.startswith("receipt:"):
                                    del episodes[key]
                        path.write_text(json.dumps(covered))
                    # Simulate the existing pre-upgrade signal before its first refresh.
                    signal_path = next((root / "factory-signals").glob("*.json"))
                    previous = json.loads(signal_path.read_text())
                    previous.pop("_receiptHistory", None)
                    signal_path.write_text(json.dumps(previous))
                    (receipts / "0.json").unlink()
                    fs.write(root, fs.cheap_fixer_signals(receipts))
                    self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "exists")
                    self.assertEqual(len(linear.created), 1)
                    (receipts / "new.json").write_text(json.dumps(row))
                    fs.write(root, fs.cheap_fixer_signals(receipts))
                    self.assertEqual(fi.run_pass(root, linear)["results"][0]["action"], "filed")

if __name__ == "__main__":
    unittest.main()
