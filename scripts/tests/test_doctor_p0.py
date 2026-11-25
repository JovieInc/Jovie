"""The 2026-11-24 P0 regressions for the doctor filer guardrail (JOV-14452):
62 flapped reopenings from a mid-sweep secretHeld misread, and the per-family
rate-cap/no-twin contract under 150-key flicker. These tests are pinned by the
P0 brief; they live here because test_doctor.py's size budget is frozen."""
import importlib.util
import json
import string
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/lanes/{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


doctor = load("doctor")


class MutableClock:
    def __init__(self, value):
        self.value = value

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


def obs(**overrides):
    """The minimal observation base doctor.judge needs (mirrors test_doctor.py)."""
    base = {"now": 1_000_000.0, "tick": {"at": "2026-09-26T21:00:00Z", "unhealthy": [], "error": None},
            "gateTimeouts24h": 0, "failed24h": 0, "lastLandingAge": 600, "runs24h": 12, "busy": 3,
            "codex": {"generatedAt": "2026-09-26T21:00:00Z", "count": 2, "available": ["a"], "accounts": {
                "a": {"available": True, "leased": False, "resetsInS": 0},
                "b": {"available": False, "leased": False, "lastKind": "limit",
                      "exhaustedUntil": "2026-09-26T21:15:00Z", "resetsInS": 900}}},
            "pool": 40, "linearError": None, "githubRemaining": 4000, "diskFreePct": 35.0,
            "openPRCount": 0, "newIssueBudgetByProvider": {"devin": {"reason": "within-budget"}},
            "hudExpected": True, "hudBeatAge": 3}
    base.update(overrides)
    return base


class RecordingLinear:
    """A Linear transport double that records every state-changing write."""

    def __init__(self):
        self.issues, self.moves, self.comments, self.counter = {}, [], [], 0

    def gql(self, query, variables):
        if "description:{contains:$d}" in query:
            rows = [{"id": id_, "state": {"type": row["state"]}} for id_, row in self.issues.items()
                    if variables["d"] in row["description"]]
            return {"issues": {"nodes": rows[:5]}}
        if "issue(id:$id){description}" in query:  # the install-receipt gate reads the body
            row = self.issues.get(variables["id"]) or {}
            return {"issue": {"description": row.get("description", "")}}
        if "issue(id:$id){state{type}}" in query:
            row = self.issues.get(variables["id"]) or {}
            return {"issue": {"state": {"type": row.get("state", "started")}}}
        if "teams(filter" in query:
            return {"teams": {"nodes": [{"id": "team", "states": {"nodes": [
                {"id": "triage", "name": "Triage"}, {"id": "backlog", "name": "Backlog"},
                {"id": "done", "name": "Done"}]}, "labels": {"nodes": [
                    {"id": "symphony", "name": "symphony"}]}}]}}
        if "issueLabels(" in query:
            return {"issueLabels": {"nodes": []}}
        if "issueAddLabel" in query:
            return {"issueAddLabel": {"success": True}}
        if "issueUpdate" in query:
            if variables["id"] in self.issues and variables.get("d") is not None:
                self.issues[variables["id"]]["description"] = variables["d"]
            return {"issueUpdate": {"success": True}}
        if "issueCreate" in query:
            self.counter += 1
            created = variables["i"]
            state = {"backlog": "backlog", "done": "completed"}.get(created.get("stateId"), "triage")
            self.issues[f"ISSUE-{self.counter}"] = {
                "title": created["title"], "description": created.get("description", ""),
                "state": state, "labels": list(created.get("labelIds") or [])}
            return {"issueCreate": {"issue": {"id": f"ISSUE-{self.counter}", "identifier": f"JOV-{self.counter}"}}}
        raise AssertionError(f"unhandled query: {query[:90]}")

    def move(self, issue_id, target):
        self.moves.append((issue_id, target))
        if issue_id in self.issues:
            self.issues[issue_id]["state"] = "completed" if target == "Done" else "triage"
        return True

    def state_of(self, issue_id):
        return "Done" if (self.issues.get(issue_id) or {}).get("state") == "completed" else "Triage"

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))
        return True


class FilerGuardrailP0Test(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = MutableClock(1_000_000.0)
        for module in (doctor.doctor_keys, doctor.doctor_filer):
            patcher = mock.patch.object(module.time, "time", self.clock)
            patcher.start()
            self.addCleanup(patcher.stop)

    def tracker(self):
        return doctor.Tracker(RecordingLinear(), "gem",
                              doctor.doctor_filer.FilerLedger(Path(self.tmp.name) / "doctor-filer.json"))

    def test_150_flickering_keys_capped_per_family_never_two_open(self):
        tracker = self.tracker()
        names = [a + b for a in string.ascii_lowercase for b in string.ascii_lowercase][:150]
        alerts = {f"flicker:{name}": f"condition {name} volatile" for name in names}
        state = {}
        for tick in range(20):  # 20 ticks over one hour, all 150 keys flickering
            firing = alerts if tick % 2 == 0 else {}
            state = doctor.reconcile(firing, state, tracker, self.clock.value)
            self.clock.advance(180)
        linear = tracker.linear
        owners = [row for row in linear.issues.values()
                  if "doctor-key:" in row["description"] and not row["title"].startswith("Symphony doctor: rollup")]
        rollups = [row for row in linear.issues.values() if row["title"].startswith("Symphony doctor: rollup")]
        self.assertLessEqual(len(owners), 3, "at most 3 creates in the flicker family's first hour")
        self.assertEqual(len(rollups), 1, "the overflow folds into exactly one rollup issue")
        self.assertEqual(rollups[0]["state"], "backlog", "the rollup never lands in Triage (P0)")
        triage_moves = [move for move in linear.moves if move[1] == "Triage"]
        done_moves = [move for move in linear.moves if move[1] == "Done"]
        self.assertEqual((triage_moves, done_moves), ([], []),
                         "one-tick absences neither close nor reopen: 0 further state changes")
        markers = [row["description"].split("doctor-key:")[1].split(" -->")[0] for row in owners]
        self.assertEqual(len(markers), len(set(markers)), "never two open issues for one key")

    def test_mid_sweep_startedat_only_is_unknown_and_closes_nothing(self):
        state_dir = Path(self.tmp.name)
        sweep = state_dir / "worktree-sweep.json"
        sweep.write_text(json.dumps({"startedAt": 1, "endedAt": 60, "secretHeldCoverage": "known",
                                     "secretHeld": [{"name": "wt-a", "path": "/x", "reason": "secret-finding:183"}]}))
        held = doctor.doctor_sweep_hold.observe(state_dir)
        self.assertEqual(held["sweepSecretHeldCoverage"], "known", "a completed sweep reports its holds")
        sweep.write_text(json.dumps({"startedAt": 100}))  # mid-sweep: the P0 shape
        mid = doctor.doctor_sweep_hold.observe(state_dir)
        self.assertIsNone(mid["sweepSecretHeld"], "a startedAt-only report has no readable held set")
        self.assertEqual(mid["sweepSecretHeldCoverage"], "unknown", "unknown, never empty (P0 2026-11-24)")
        previous = {"alerts": {doctor.doctor_sweep_hold.KEY: "snapshot preservation is held for 1 worktree(s)"}}
        carried = doctor.judge(obs(**mid), previous)
        self.assertIn(doctor.doctor_sweep_hold.KEY, carried, "unknown coverage retains the hold alert")
        tracker = self.tracker()
        delivered = []
        state = doctor.reconcile(carried, previous, tracker, self.clock.value,
                                 sweep_delivery=lambda text: delivered.append(text) or ("owner-x", True))
        self.assertEqual(tracker.linear.moves, [], "a mid-sweep snapshot closes nothing")
        self.assertEqual(tracker.linear.issues, {}, "a mid-sweep snapshot files nothing either")
        self.assertEqual(delivered, ["snapshot preservation is held for 1 worktree(s); sweep coverage unknown "
                                     "(in progress or unreadable) — hold state unchanged, nothing counted or cleared"],
                         "the human-owned Gem tracker gets a status note carrying the unknown-coverage hold")
        self.assertEqual(state["issues"][doctor.doctor_sweep_hold.KEY]["ownerVerified"], True)
        sweep.write_text(json.dumps({"startedAt": 1, "endedAt": 260, "secretHeldCoverage": "known",
                                     "secretHeld": []}))  # the sweep really finished with no holds
        cleared = doctor.judge(obs(**doctor.doctor_sweep_hold.observe(state_dir)), {"alerts": carried})
        self.assertNotIn(doctor.doctor_sweep_hold.KEY, cleared, "only real evidence clears the hold")


if __name__ == "__main__":
    unittest.main()
