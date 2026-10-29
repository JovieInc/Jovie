"""Standing decomposition loop: hermetic, no model, no network."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

LANES = Path(__file__).resolve().parents[1] / "lanes"
sys.path.insert(0, str(LANES))
import decompose_pass as dp  # noqa: E402
import linear_sync as ls  # noqa: E402

NOW = 1_800_000_000.0
LONG = "## Scope\n" + "A program with many parts. " * 130 + "\n"


def row(n, labels=("readiness-checked",), state="Backlog", description=LONG, parent=None, priority=2):
    return {"id": f"id{n}", "identifier": f"LYB-{n}", "title": f"Epic {n}", "description": description, "priority": priority,
            "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-10-20T00:00:00Z", "state": state, "labels": list(labels),
            "labelsComplete": True, "parent": {"id": parent} if parent else None, "stateType": "backlog"}


def make_state(rows, todo=3, target=34):
    tmp = tempfile.TemporaryDirectory()
    state = Path(tmp.name)
    path = ls.mirror_path(state, "LYB")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema": ls.MIRROR, "syncedAt": NOW, "issues": {r["id"]: r for r in rows}}))
    (state / "refill").mkdir()
    (state / "refill" / "LYB.json").write_text(json.dumps({"todo": todo, "target": target}))
    return tmp, state


GOOD = [{"title": "Rolling selector pure function with fixtures", "scope": "Add a pure selector under the view models with tests only; no UI.",
         "acceptance": ["Deterministic output for the fixture table"], "tests": "XCTest table-driven fixtures", "deps": "None", "priority": 2,
         "needs_decision": False},
        {"title": "Decision: wording of the deload prompt", "scope": "The wording and tone of the prompt shown to the user for deload offers.",
         "acceptance": ["Approved copy recorded"], "tests": "n/a", "deps": "None", "priority": 2, "needs_decision": True,
         "question": "What does the prompt say?", "default": "Plain one-line offer with a Not now link"}]


class TriggerTests(unittest.TestCase):
    def test_runs_only_below_half_target_with_a_splittable_epic(self):
        tmp, state = make_state([row(1)]); self.addCleanup(tmp.cleanup)
        mirror = ls.read_mirror(state, "LYB")
        self.assertTrue(dp.triggered({"todo": 16, "target": 34}, mirror, NOW, {})["run"])
        self.assertEqual(dp.triggered({"todo": 17, "target": 34}, mirror, NOW, {})["why"], "todo-at-or-above-half-target")
        self.assertEqual(dp.triggered({"todo": 3, "target": 0}, mirror, NOW, {})["why"], "no-target")

    def test_no_run_without_an_epic_or_inside_the_cooldown_or_with_children(self):
        tmp, state = make_state([row(1, labels=("lyb",), description="short")]); self.addCleanup(tmp.cleanup)
        self.assertEqual(dp.triggered({"todo": 1, "target": 34}, ls.read_mirror(state, "LYB"), NOW, {})["why"], "no-splittable-epic")
        tmp2, state2 = make_state([row(1), row(2, labels=("lyb",), parent="id1", description="child")]); self.addCleanup(tmp2.cleanup)
        self.assertFalse(dp.triggered({"todo": 1, "target": 34}, ls.read_mirror(state2, "LYB"), NOW, {})["run"])
        tmp3, state3 = make_state([row(1)]); self.addCleanup(tmp3.cleanup)
        self.assertFalse(dp.triggered({"todo": 1, "target": 34}, ls.read_mirror(state3, "LYB"), NOW, {"LYB-1": NOW - 86400})["run"])

    def test_holds_and_planning_only_intakes_are_never_split(self):
        for labels, text in ((("readiness-checked", "needs-tim"), LONG), (("readiness-checked", "hold"), LONG),
                             (("readiness-checked",), LONG + "Backlog planning only; do not dispatch."),
                             (("type:epic",), LONG + "No implementation is authorized by this planning intake.")):
            self.assertFalse(dp.splittable(row(1, labels=labels, description=text)), (labels, text[-40:]))
        self.assertTrue(dp.splittable(row(1, labels=("type:epic",))))


class ValidateTests(unittest.TestCase):
    def test_risky_text_is_forced_to_a_decision_and_needs_a_question_and_default(self):
        risky = dict(GOOD[0], title="Rewrite the onboarding copy for the paywall", needs_decision=False)
        self.assertEqual(dp.validate([risky]), [])  # risky + no question/default: dropped, never agent-ready
        ok = dp.validate([dict(risky, question="Which wording?", default="Keep the current wording")])
        self.assertTrue(ok[0]["decision"])
        self.assertFalse(dp.validate([GOOD[0]])[0]["decision"])

    def test_malformed_slices_are_dropped_and_count_is_capped(self):
        self.assertEqual(dp.validate("nope"), [])
        self.assertEqual(dp.validate([{"title": "x"}, dict(GOOD[0], acceptance=[])]), [])
        many = [dict(GOOD[0], title=f"Pure policy number {i} with fixtures") for i in range(20)]
        self.assertEqual(len(dp.validate(many)), dp.MAX_SLICES)


class RunTests(unittest.TestCase):
    def test_run_enqueues_idempotent_creates_labels_and_a_parent_note(self):
        tmp, state = make_state([row(1)]); self.addCleanup(tmp.cleanup)
        receipt = dp.run(state, "LYB", NOW, judge=lambda prompt: json.dumps(GOOD))
        self.assertEqual(receipt["proposals"]["LYB-1"]["ready"], 1)
        self.assertEqual(receipt["proposals"]["LYB-1"]["decisions"], 1)
        entries = json.loads((state / "linear" / "outbox.json").read_text())["entries"]
        creates = [json.loads(e["body"]) for e in entries if e["op"] == "create"]
        self.assertEqual(sorted(c["labels"][0] for c in creates), ["agent-ready", "agent-ready"])
        self.assertEqual(sum(1 for e in entries if e["op"] == "comment"), 1)
        again = dp.run(state, "LYB", NOW + 7 * 3600, judge=lambda prompt: json.dumps(GOOD))
        self.assertEqual(again["trigger"]["why"], "no-splittable-epic")  # cooldown holds the epic
        self.assertEqual(len([e for e in json.loads((state / "linear" / "outbox.json").read_text())["entries"] if e["op"] == "create"]), 2)

    def test_min_interval_and_kill_switch_and_dry_run(self):
        tmp, state = make_state([row(1)]); self.addCleanup(tmp.cleanup)
        dp.run(state, "LYB", NOW, judge=lambda p: "[]")
        self.assertEqual(dp.run(state, "LYB", NOW + 60, judge=lambda p: "[]")["held"], "min-interval")
        import os
        os.environ["BACKLOG_DECOMPOSE_OWNER"] = "none"
        self.addCleanup(os.environ.pop, "BACKLOG_DECOMPOSE_OWNER", None)
        self.assertEqual(dp.run(state, "LYB", NOW + 10**6, judge=lambda p: json.dumps(GOOD))["held"], "kill-switch")

    def test_dry_run_writes_nothing(self):
        tmp, state = make_state([row(1)]); self.addCleanup(tmp.cleanup)
        dp.run(state, "LYB", NOW, judge=lambda p: json.dumps(GOOD), dry_run=True)
        self.assertFalse((state / "linear" / "outbox.json").exists())


class CreateOpTests(unittest.TestCase):
    class Fake:
        def __init__(self, children=()):
            self.children, self.created = list(children), []

        def gql(self, query, variables):
            if "children(first" in query:
                return {"issue": {"team": {"id": "t1", "key": "LYB", "states": {"nodes": [{"id": "s1", "name": "Backlog"}]}},
                                  "children": {"nodes": [{"id": "c", "identifier": "LYB-9", "title": t} for t in self.children]}}}
            if "issueLabels" in query:
                return {"issueLabels": {"nodes": [{"id": "l-" + variables["n"], "name": variables["n"], "team": None}]}}
            self.created.append(variables["i"])
            return {"issueCreate": {"success": True, "issue": {"id": "n", "identifier": "LYB-300", "title": "x"}}}

    def entry(self, tmp):
        payload = json.dumps({"title": "A child", "description": "d", "priority": 2, "labels": ["agent-ready"]})
        ls.enqueue(tmp, "create", "parent1", body=payload)
        ls.enqueue(tmp, "create", "parent1", body=payload)  # idempotent enqueue
        entries = json.loads((tmp / "linear" / "outbox.json").read_text())["entries"]
        self.assertEqual(len(entries), 1)
        return entries[0]

    def test_creates_in_backlog_under_the_parent_with_resolved_labels(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        fake = self.Fake()
        self.assertEqual(ls._deliver_create(Path(tmp.name), fake, self.entry(Path(tmp.name))), "created")
        self.assertEqual(fake.created[0]["parentId"], "parent1")
        self.assertEqual(fake.created[0]["stateId"], "s1")
        self.assertEqual(fake.created[0]["labelIds"], ["l-agent-ready"])

    def test_an_existing_child_with_the_same_title_is_the_readback(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        fake = self.Fake(children=["A child"])
        self.assertEqual(ls._deliver_create(Path(tmp.name), fake, self.entry(Path(tmp.name))), "already")
        self.assertEqual(fake.created, [])


if __name__ == "__main__":
    unittest.main()
